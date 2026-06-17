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

  it('matches worked example from METHODOLOGY.md (compute + EKS control plane)', () => {
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [awsSheet]);

    const provider = result.providers[0];
    const compute = provider.lineItems
      .filter((i) => i.category === 'compute')
      .reduce((s, i) => s + i.monthlyUsd, 0);

    // CPU: 0.5 × 3 × 730 × 0.0416 ≈ 45.55
    // Mem: 0.5 × 3 × 730 × 0.0052 ≈ 5.69
    expect(compute).toBeCloseTo(51.24, 0);
    expect(provider.lineItems.find((i) => i.category === 'control_plane')?.monthlyUsd).toBe(73);
    expect(provider.totalMonthlyUsd).toBeCloseTo(124.24, 0);
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

  it('includes per-workload compute breakdown', () => {
    const parsed = parseManifests(nginxYaml, defaults);
    const result = estimate(parsed, [awsSheet]);

    expect(result.workloads).toHaveLength(1);
    expect(result.workloads[0]).toMatchObject({
      kind: 'Deployment',
      name: 'nginx',
      replicas: 3,
      cpuCores: 1.5,
    });
    expect(result.workloads[0].computeMonthlyUsd.aws).toBeCloseTo(51.24, 0);
  });
});
