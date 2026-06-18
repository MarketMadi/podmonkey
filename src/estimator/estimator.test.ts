import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifests } from '../parser/index';
import { estimate } from './index';
import { parseCpu, parseMemory } from '../units';
import type { PriceSheet } from '../types';

const awsSheet = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../pricing/aws-us-east-1.json'), 'utf8'),
) as PriceSheet;

const defaults = awsSheet.defaults;

const nginxYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
`;

const nginxWithLbYaml = `${nginxYaml}
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-lb
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
    - port: 80
`;

describe('units', () => {
  it('parses CPU millicores', () => {
    expect(parseCpu('500m')).toBe(0.5);
    expect(parseCpu('2')).toBe(2);
  });

  it('parses memory', () => {
    expect(parseMemory('512Mi')).toBeCloseTo(0.5, 3);
    expect(parseMemory('1Gi')).toBe(1);
  });
});

describe('estimator', () => {
  it('nginx on EKS: marginal ~$30, node floor ~$24 (t4g.medium catalog)', () => {
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [awsSheet]);
    const provider = result.providers[0];

    expect(provider.computeMonthlyUsdRange.min).toBeCloseTo(24.53, 0);
    expect(provider.computeMonthlyUsdRange.max).toBeCloseTo(30.11, 0);
    expect(provider.lineItems.find((i) => i.category === 'control_plane')?.monthlyUsd).toBe(73);
    expect(provider.totalMonthlyUsdRange.min).toBeCloseTo(97.53, 0);
    expect(provider.totalMonthlyUsdRange.max).toBeCloseTo(103.11, 0);
    expect(provider.nodeCount).toBe(1);
    expect(provider.nodeInstanceType).toBe('t4g.medium');
  });

  it('nginx + LB on EKS: total range ~$116–$121', () => {
    const parsed = parseManifests(nginxWithLbYaml, defaults);
    const result = estimate(parsed, [awsSheet]);
    const provider = result.providers[0];

    expect(provider.totalMonthlyUsdRange.min).toBeCloseTo(115.53, 0);
    expect(provider.totalMonthlyUsdRange.max).toBeCloseTo(121.11, 0);
  });

  it('counts load balancers', () => {
    const yaml = `
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: LoadBalancer
  ports:
    - port: 80
`;
    const parsed = parseManifests(yaml, defaults);
    const result = estimate(parsed, [awsSheet]);
    expect(result.totals.loadBalancerCount).toBe(1);
    expect(
      result.providers[0].lineItems.find((i) => i.category === 'load_balancer')?.monthlyUsd,
    ).toBe(18);
  });

  it('includes per-workload compute range', () => {
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [awsSheet]);

    expect(result.workloads).toHaveLength(1);
    expect(result.workloads[0].computeMonthlyUsdRange.aws?.min).toBeCloseTo(24.53, 0);
    expect(result.workloads[0].computeMonthlyUsdRange.aws?.max).toBeCloseTo(30.11, 0);
  });

  it('assigns high confidence when requests are set', () => {
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [awsSheet]);
    expect(result.confidence.level).toBe('high');
    expect(result.confidence.score).toBeGreaterThanOrEqual(80);
  });

  it('hetzner uses node-only compute model', () => {
    const hetzner = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../pricing/hetzner-fsn1.json'),
        'utf8',
      ),
    ) as PriceSheet;
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [hetzner]);
    const p = result.providers[0];
    expect(p.computeMonthlyUsdRange.min).toBe(p.computeMonthlyUsdRange.max);
  });

  it('redis StatefulSet: 30 GiB PVC storage at gp3 $0.08/GiB-mo', () => {
    const redisYaml = readFileSync(
      join(import.meta.dirname, '../../examples/redis-statefulset.yaml'),
      'utf8',
    );
    const parsed = parseManifests(redisYaml, defaults);
    const result = estimate(parsed, [awsSheet]);
    const provider = result.providers[0];

    // 3 replicas × 10Gi volumeClaimTemplate = 30 GiB
    expect(parsed.pvcs).toHaveLength(3);
    expect(result.totals.storageGiB).toBe(30);

    // Storage: 30 GiB × $0.08/GiB-mo = $2.40/mo (gp3 default)
    const storageItem = provider.lineItems.find((i) => i.category === 'storage');
    expect(storageItem?.monthlyUsd).toBe(2.4);

    // Compute: 0.75 vCPU, 0.75 GiB — fits one t4g.medium at floor
    expect(provider.computeMonthlyUsdRange.min).toBeCloseTo(15.02, 0);
    expect(provider.computeMonthlyUsdRange.max).toBeCloseTo(24.53, 0);

    // Total includes $73 EKS control plane
    expect(provider.totalMonthlyUsdRange.min).toBeCloseTo(90.42, 0);
    expect(provider.totalMonthlyUsdRange.max).toBeCloseTo(99.93, 0);
  });
});
