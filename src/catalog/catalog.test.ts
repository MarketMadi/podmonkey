import { describe, expect, it } from 'vitest';
import { loadModelCatalog } from './load';
import { computeModelVram, minGpuTierForVram } from './resolve';
import { assertValidModelCatalog, validateModelCatalog } from './validate';
import { collectModelVramWarnings } from './warnings';

describe('model catalog', () => {
  const catalog = loadModelCatalog();

  it('passes validation', () => {
    expect(validateModelCatalog(catalog)).toEqual([]);
    expect(() => assertValidModelCatalog(catalog)).not.toThrow();
  });

  it('Llama 8B Q4 fits 24GB tier', () => {
    const vram = computeModelVram({
      modelId: 'llama-3.1-8b',
      quantization: 'Q4_K_M',
      contextLength: 4096,
      concurrentUsers: 1,
      catalog,
    });
    expect(vram.weightsGiB).toBe(5);
    expect(vram.totalGiB).toBeCloseTo(7.32, 1);
    expect(vram.minGpuTier).toBe('t4-16gb');
  });

  it('Llama 70B Q4 with 3 users needs A100 80GB', () => {
    const vram = computeModelVram({
      modelId: 'llama-3.3-70b',
      quantization: 'Q4_K_M',
      contextLength: 4096,
      concurrentUsers: 3,
      catalog,
    });
    expect(vram.weightsGiB).toBe(43);
    expect(vram.kvCacheGiB).toBe(6);
    expect(vram.minGpuTier).toBe('a100-80gb');
  });

  it('emits KV_CACHE_TIGHT for high concurrent users', () => {
    const vram = computeModelVram({
      modelId: 'llama-3.1-8b',
      quantization: 'Q4_K_M',
      contextLength: 8192,
      concurrentUsers: 10,
      catalog,
    });
    const warnings = collectModelVramWarnings(vram);
    expect(warnings.some((w) => w.id === 'KV_CACHE_TIGHT')).toBe(true);
  });

  it('DeepSeek V3 flags multi-GPU cluster need', () => {
    const vram = computeModelVram({
      modelId: 'deepseek-v3',
      quantization: 'Q4_K_M',
      catalog,
    });
    expect(vram.weightsGiB).toBe(378);
    expect(vram.exceedsSingleGpu).toBe(true);
    const warnings = collectModelVramWarnings(vram);
    expect(warnings.some((w) => w.id === 'MODEL_EXCEEDS_VRAM')).toBe(true);
  });
});
