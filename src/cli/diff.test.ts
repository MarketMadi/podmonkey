import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeEstimateDiff } from './diff';
import { checkPolicy } from './policy';
import { runEstimate } from './run-estimate';

const nginxPath = join(
  import.meta.dirname,
  '../../examples/nginx-deployment.yaml',
);
const fatPath = join(
  import.meta.dirname,
  '../../examples/fat-deployment.yaml',
);

describe('computeEstimateDiff', () => {
  it('shows increase when moving from nginx to fat deployment', () => {
    const nginx = runEstimate({
      yaml: readFileSync(nginxPath, 'utf8'),
      providers: ['aws'],
    });
    const fat = runEstimate({
      yaml: readFileSync(fatPath, 'utf8'),
      providers: ['aws'],
    });
    const diff = computeEstimateDiff(nginx, fat);

    expect(diff.byProvider).toHaveLength(1);
    expect(diff.byProvider[0].deltaMax).toBeGreaterThan(50);
    expect(diff.maxIncreaseUsd).toBe(diff.byProvider[0].deltaMax);
  });
});

describe('checkPolicy', () => {
  it('fails when max monthly exceeded', () => {
    const result = runEstimate({
      yaml: readFileSync(nginxPath, 'utf8'),
      providers: ['aws'],
    });
    const violations = checkPolicy(result, { maxMonthlyUsd: 50 });
    expect(violations.some((v) => v.code === 'MAX_MONTHLY_USD')).toBe(true);
  });

  it('fails when confidence too low for fat deployment', () => {
    const result = runEstimate({
      yaml: readFileSync(fatPath, 'utf8'),
      providers: ['aws'],
    });
    const violations = checkPolicy(result, { minConfidence: 90 });
    expect(violations.some((v) => v.code === 'MIN_CONFIDENCE')).toBe(true);
  });

  it('fails on monthly increase vs base', () => {
    const nginx = runEstimate({
      yaml: readFileSync(nginxPath, 'utf8'),
      providers: ['aws'],
    });
    const fat = runEstimate({
      yaml: readFileSync(fatPath, 'utf8'),
      providers: ['aws'],
    });
    const diff = computeEstimateDiff(nginx, fat);
    const violations = checkPolicy(fat, { maxMonthlyIncreaseUsd: 10 }, diff);
    expect(violations.some((v) => v.code === 'MAX_MONTHLY_INCREASE')).toBe(
      true,
    );
  });
});
