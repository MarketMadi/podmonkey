import { describe, expect, it } from 'vitest';
import { loadModelCatalog } from '../catalog/load';
import { parseInferenceProfile } from './inference-profile';
import { estimateInference, podBreakEvenRequestsPerDay } from '../estimator/inference';
import { loadAllApiPriceSheets } from '../pricing/load-api-sheets';
import { loadAllMarketplacePriceSheets } from '../pricing/load-marketplace-sheets';

const sheets = loadAllMarketplacePriceSheets();
const apiSheets = loadAllApiPriceSheets();
const catalog = loadModelCatalog();

const FOUNDER_YAML = `
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: chatbot
spec:
  model: llama-3.1-8b
  requestsPerDay: 3000
  inputTokensPerRequest: 800
  outputTokensPerRequest: 250
  billing: serverless
  workers: 1
`;

describe('inference profile (founder)', () => {
  it('derives seconds from token inputs', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    expect(profile.inputTokensPerRequest).toBe(800);
    expect(profile.outputTokensPerRequest).toBe(250);
    expect(profile.avgSecondsPerRequest).toBeGreaterThan(0);
    expect(profile.gpu).toBe('t4-16gb');
  });

  it('recommends API for typical week-1 chatbot volume', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    expect(result.apiProviders.length).toBeGreaterThan(0);
    expect(result.verdict.kind).toBe('api');
    expect(result.verdict.monthlyUsd).toBeLessThan(500);
    expect(result.warnings.some((w) => w.id === 'FOUNDER_PLANNING')).toBe(true);
  });

  it('estimates GPU marketplace when model fits', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    expect(result.providers.length).toBeGreaterThanOrEqual(3);
    expect(result.totals.tokensPerMonth).toBe((800 + 250) * 3000 * 30);
  });

  it('parses advanced GPU override with model + seconds', () => {
    const yaml = `
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: test
spec:
  model: llama-3.3-70b
  billing: serverless
  gpu: a100-80gb
  requestsPerDay: 1000
  inputTokensPerRequest: 1000
  outputTokensPerRequest: 500
  workers: 1
`;
    const profile = parseInferenceProfile(yaml, catalog);
    expect(profile.gpu).toBe('a100-80gb');
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
