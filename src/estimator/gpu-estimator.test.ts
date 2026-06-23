import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifests } from '../parser/index';
import { estimate } from './index';
import { loadAllGpuPriceSheets } from '../pricing/load-gpu-sheets';
import { loadPriceSheet } from '../pricing/load-sheets';

describe('GPU K8s estimates', () => {
  it('includes GPU line item for AWS when nvidia.com/gpu is set', () => {
    const yaml = readFileSync(
      join(import.meta.dirname, '../../examples/vllm-gpu-deployment.yaml'),
      'utf8',
    );
    const defaults = loadPriceSheet('aws').defaults;
    const parsed = parseManifests(yaml, defaults);
    const sheets = [loadPriceSheet('aws')];
    const gpuSheets = loadAllGpuPriceSheets().filter((s) => s.provider === 'aws');
    const result = estimate(parsed, sheets, {}, gpuSheets);

    expect(result.totals.gpuCount).toBe(1);
    const aws = result.providers[0];
    expect(aws.gpuCount).toBe(1);
    expect(aws.lineItems.some((i) => i.category === 'gpu')).toBe(true);
    expect(aws.totalMonthlyUsd).toBeGreaterThan(300);
  });
});
