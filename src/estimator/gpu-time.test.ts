import { describe, expect, it } from 'vitest';
import { loadModelCatalog } from '../catalog/load';
import { gpuSecondsPerRequest, gpuTimingBreakdown } from './gpu-time';

describe('gpu-time', () => {
  const catalog = loadModelCatalog();

  it('prefill is faster than treating all tokens as decode', () => {
    const breakdown = gpuTimingBreakdown({
      inputTokens: 800,
      outputTokens: 250,
      decodeTokensPerSecond: 45,
      prefillTokensPerSecond: 360,
      billing: 'serverless',
      coldStartSeconds: 0.3,
    });
    expect(breakdown.prefillSeconds).toBeCloseTo(800 / 360, 2);
    expect(breakdown.decodeSeconds).toBeCloseTo(250 / 45, 2);
    expect(breakdown.totalSeconds).toBeCloseTo(8.08, 1);
    expect(breakdown.totalSeconds).toBeLessThan(12);
  });

  it('derives founder chatbot seconds from catalog', () => {
    const profile = {
      name: 'chatbot',
      billing: 'auto' as const,
      gpu: 't4-16gb' as const,
      model: 'llama-3.1-8b',
      inputTokensPerRequest: 800,
      outputTokensPerRequest: 250,
      requestsPerDay: 3000,
      avgSecondsPerRequest: 1,
      workers: 1,
    };
    const sec = gpuSecondsPerRequest(profile, catalog, 'serverless');
    expect(sec).toBeCloseTo(8.08, 1);
  });
});
