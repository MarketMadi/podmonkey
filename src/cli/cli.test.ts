import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatEstimateJson, formatEstimateMarkdown, formatEstimateText, PR_COMMENT_MARKER } from './format';
import { readYamlInput, runEstimate } from './run-estimate';

const nginxPath = join(
  import.meta.dirname,
  '../../examples/nginx-deployment.yaml',
);

describe('CLI runEstimate', () => {
  it('estimates nginx example for AWS only', () => {
    const yaml = readFileSync(nginxPath, 'utf8');
    const result = runEstimate({ yaml, providers: ['aws'] });

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].totalMonthlyUsdRange.min).toBeCloseTo(121.11, 0);
    expect(result.providers[0].totalMonthlyUsdRange.max).toBeCloseTo(121.37, 0);
  });

  it('loads all four default providers', () => {
    const yaml = readFileSync(nginxPath, 'utf8');
    const result = runEstimate({ yaml });
    expect(result.providers).toHaveLength(4);
  });
});

describe('CLI format', () => {
  it('renders human text with provider names', () => {
    const yaml = readFileSync(nginxPath, 'utf8');
    const result = runEstimate({ yaml, providers: ['aws'] });
    const text = formatEstimateText(result);

    expect(text).toContain('AWS EKS');
    expect(text).toContain('Confidence:');
    expect(text).toContain('Planning estimate only');
  });

  it('renders valid JSON', () => {
    const yaml = readFileSync(nginxPath, 'utf8');
    const result = runEstimate({ yaml, providers: ['aws'] });
    const parsed = JSON.parse(formatEstimateJson(result));

    expect(parsed.providers[0].provider).toBe('aws');
    expect(parsed.confidence.score).toBeGreaterThan(0);
  });

  it('renders markdown with PR marker and table', () => {
    const yaml = readFileSync(nginxPath, 'utf8');
    const result = runEstimate({ yaml, providers: ['aws'] });
    const md = formatEstimateMarkdown(result, { path: 'examples/nginx-deployment.yaml' });

    expect(md).toContain(PR_COMMENT_MARKER);
    expect(md).toContain('## 🐒 Podmonkey cost estimate');
    expect(md).toContain('| AWS EKS |');
    expect(md).toContain('Planning estimate only');
  });

  it('reads all YAML files from a directory', () => {
    const dir = join(import.meta.dirname, '../../examples');
    const yaml = readYamlInput(dir);
    const result = runEstimate({ yaml, providers: ['aws'] });

    expect(result.workloads.length).toBeGreaterThanOrEqual(2);
  });
});
