import { describe, expect, it } from 'vitest';
import { loadModelCatalog } from '../catalog/load';
import { parseInferenceProfile } from './inference-profile';
import { estimateInference, podBreakEvenRequestsPerDay } from '../estimator/inference';
import { loadAllMarketplacePriceSheets } from '../pricing/load-marketplace-sheets';

const sheets = loadAllMarketplacePriceSheets();
const catalog = loadModelCatalog();

describe('inference profile', () => {
  it('parses serverless A100 profile', () => {
    const yaml = `
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: test
spec:
  billing: serverless
  gpu: a100-80gb
  requestsPerDay: 1000
  avgSecondsPerRequest: 2
  workers: 1
`;
    const profile = parseInferenceProfile(yaml, catalog);
    expect(profile.gpu).toBe('a100-80gb');
    expect(profile.billing).toBe('serverless');
  });

  it('derives GPU tier from model catalog', () => {
    const yaml = `
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: test
spec:
  model: llama-3.1-8b
  quantization: Q4_K_M
  billing: serverless
  requestsPerDay: 1000
  avgSecondsPerRequest: 2
  workers: 1
`;
    const profile = parseInferenceProfile(yaml, catalog);
    expect(profile.model).toBe('llama-3.1-8b');
    expect(profile.gpu).toBe('t4-16gb');
  });

  it('estimates across marketplace providers', () => {
    const profile = {
      name: 'test',
      billing: 'serverless' as const,
      gpu: 'a100-80gb' as const,
      requestsPerDay: 10000,
      avgSecondsPerRequest: 2,
      workers: 1,
    };
    const result = estimateInference(profile, sheets, catalog);
    expect(result.providers.length).toBeGreaterThanOrEqual(3);
    expect(result.providers[0].totalMonthlyUsd).toBeGreaterThan(0);
    const runpod = result.providers.find((p) => p.provider === 'runpod');
    expect(runpod).toBeDefined();
    expect(runpod!.totalMonthlyUsd).toBeCloseTo(456, 0);
    expect(runpod!.usdPerMillionTokens).toBeGreaterThan(0);
    expect(runpod!.podBreakEvenRequestsPerDay).toBeGreaterThan(0);
  });

  it('model profile includes VRAM summary and $/1M tokens', () => {
    const profile = parseInferenceProfile(
      `
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: rag
spec:
  model: llama-3.1-8b
  quantization: Q4_K_M
  contextLength: 8192
  concurrentUsers: 10
  billing: serverless
  requestsPerDay: 10000
  avgSecondsPerRequest: 2
  workers: 1
`,
      catalog,
    );
    const result = estimateInference(profile, sheets, catalog);
    expect(result.model?.label).toContain('Llama 3.1 8B');
    expect(result.totals.tokensPerMonth).toBeGreaterThan(0);
    expect(result.totals.usdPerMillionTokens).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.id === 'KV_CACHE_TIGHT')).toBe(true);
  });

  it('computes pod break-even requests per day', () => {
    const runpod = sheets.find((s) => s.provider === 'runpod')!;
    const tier = runpod.tiers.find((t) => t.id === 'a100-80gb')!;
    const breakEven = podBreakEvenRequestsPerDay(
      tier,
      { avgSecondsPerRequest: 2, workers: 1 },
      runpod.hours_per_month,
    );
    expect(breakEven).not.toBeNull();
    expect(breakEven!).toBeGreaterThan(1000);
  });
});
