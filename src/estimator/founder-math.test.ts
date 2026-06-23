import { describe, expect, it } from 'vitest';
import { loadModelCatalog } from '../catalog/load';
import { parseInferenceProfile } from '../parser/inference-profile';
import { estimateInference } from './inference';
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
  workers: 1
`;

describe('founder math golden fixtures', () => {
  it('Groq API for chatbot ≈ $5/mo', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    const groq = result.apiProviders.find((p) => p.provider === 'groq');
    expect(groq).toBeDefined();
    // 90k × (800×0.05/1M + 250×0.08/1M) = 90k × 0.00006 = $5.40
    expect(groq!.totalMonthlyUsd).toBeCloseTo(5.4, 0);
  });

  it('RunPod serverless for chatbot ≈ $115/mo (not $300+)', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    const runpod = result.providers.find((p) => p.provider === 'runpod');
    expect(runpod).toBeDefined();
    expect(runpod!.billing).toBe('serverless');
    expect(runpod!.secondsPerRequest).toBeCloseTo(8.08, 1);
  // 90k × 8.08s × $0.00016/s ≈ $116
    expect(runpod!.totalMonthlyUsd).toBeGreaterThan(90);
    expect(runpod!.totalMonthlyUsd).toBeLessThan(150);
  });

  it('auto-picks serverless over pod at low traffic', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    const runpod = result.providers.find((p) => p.provider === 'runpod')!;
    expect(runpod.serverlessMonthlyUsd).toBeLessThan(runpod.podMonthlyUsd!);
    expect(runpod.billing).toBe('serverless');
    expect(result.warnings.some((w) => w.id === 'POD_UNDERUTILIZED')).toBe(true);
  });

  it('verdict uses Groq not OpenAI baseline', () => {
    const profile = parseInferenceProfile(FOUNDER_YAML, catalog);
    const result = estimateInference(profile, sheets, catalog, apiSheets);
    expect(result.verdict.kind).toBe('api');
    expect(result.verdict.providerLabel).toContain('Groq');
  });
});
