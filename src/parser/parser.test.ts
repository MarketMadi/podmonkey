import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifests } from './index';
import type { PriceSheet } from '../types';

const defaults = (
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../../pricing/aws-us-east-1.json'),
      'utf8',
    ),
  ) as PriceSheet
).defaults;

describe('parseManifests', () => {
  it('parses Deployment with replicas and resources', () => {
    const yaml = readFileSync(
      join(import.meta.dirname, '../../examples/nginx-deployment.yaml'),
      'utf8',
    );
    const result = parseManifests(yaml, defaults);

    expect(result.workloads).toHaveLength(1);
    expect(result.workloads[0]).toMatchObject({
      kind: 'Deployment',
      name: 'nginx',
      replicas: 3,
    });
    expect(result.workloads[0].containers[0].cpuCores).toBe(0.5);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].type).toBe('LoadBalancer');
  });

  it('parses StatefulSet with volumeClaimTemplates', () => {
    const yaml = readFileSync(
      join(import.meta.dirname, '../../examples/redis-statefulset.yaml'),
      'utf8',
    );
    const result = parseManifests(yaml, defaults);

    expect(result.workloads[0]).toMatchObject({
      kind: 'StatefulSet',
      name: 'redis',
      replicas: 3,
    });
    expect(result.pvcs).toHaveLength(3);
    expect(result.pvcs.every((p) => p.storageGiB === 10)).toBe(true);
  });

  it('applies defaults for missing requests', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: bare
spec:
  containers:
    - name: app
      image: alpine:3.19
`;
    const result = parseManifests(yaml, defaults);
    const c = result.workloads[0].containers[0];

    expect(c.cpuCores).toBe(0.1);
    expect(c.memoryGiB).toBeCloseTo(0.125, 3);
    expect(c.usedDefaults).toBe(true);
  });

  it('counts DaemonSet replicas from node count default', () => {
    const yaml = `
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      containers:
        - name: exporter
          image: prom/node-exporter
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
`;
    const result = parseManifests(yaml, defaults);
    expect(result.workloads[0].replicas).toBe(defaults.daemonset_node_count);
  });
});
