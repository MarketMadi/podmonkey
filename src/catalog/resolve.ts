import type { GpuTierId } from '../types';
import type { CatalogModel, ModelCatalog, ModelVramBreakdown } from './types';

const GPU_TIER_ORDER: GpuTierId[] = [
  't4-16gb',
  'l4-24gb',
  'a10g-24gb',
  'rtx4090-24gb',
  'a100-40gb',
  'a100-80gb',
  'h100-80gb',
];

let defaultCatalog: ModelCatalog | null = null;

/** Browser / embedded runtimes set catalog once; Node uses loadModelCatalog(). */
export function setDefaultModelCatalog(catalog: ModelCatalog): void {
  defaultCatalog = catalog;
}

export function clearDefaultModelCatalog(): void {
  defaultCatalog = null;
}

function getCatalog(catalog?: ModelCatalog): ModelCatalog {
  const cat = catalog ?? defaultCatalog;
  if (!cat) {
    throw new Error(
      'Model catalog not loaded — pass catalog or call setDefaultModelCatalog() / loadModelCatalog()',
    );
  }
  return cat;
}

export function listCatalogModels(catalog?: ModelCatalog): CatalogModel[] {
  return getCatalog(catalog).models;
}

export function getCatalogModel(
  modelId: string,
  catalog?: ModelCatalog,
): CatalogModel {
  const cat = getCatalog(catalog);
  const model = cat.models.find((m) => m.id === modelId);
  if (!model) {
    const ids = cat.models.map((m) => m.id).join(', ');
    throw new Error(`Unknown model "${modelId}". Available: ${ids}`);
  }
  return model;
}

export function resolveQuantization(
  model: CatalogModel,
  quantization?: string,
  catalog?: ModelCatalog,
): string {
  const cat = getCatalog(catalog);
  const quant =
    quantization?.trim() ||
    cat.defaults.default_quantization ||
    Object.keys(model.quantizations)[0];

  if (!model.quantizations[quant]) {
    const available = Object.keys(model.quantizations).join(', ');
    throw new Error(
      `Unknown quantization "${quant}" for ${model.id}. Use: ${available}`,
    );
  }
  return quant;
}

export function minGpuTierForVram(
  totalGiB: number,
  catalog?: ModelCatalog,
): { tier: GpuTierId; vramGiB: number; exceedsSingleGpu: boolean } {
  const cat = getCatalog(catalog);
  for (const tier of GPU_TIER_ORDER) {
    const vram = cat.gpu_tier_vram_gib[tier];
    if (vram >= totalGiB) {
      return { tier, vramGiB: vram, exceedsSingleGpu: false };
    }
  }
  const largest = GPU_TIER_ORDER[GPU_TIER_ORDER.length - 1];
  return {
    tier: largest,
    vramGiB: cat.gpu_tier_vram_gib[largest],
    exceedsSingleGpu: true,
  };
}

export function computeModelVram(input: {
  modelId: string;
  quantization?: string;
  contextLength?: number;
  concurrentUsers?: number;
  tokensPerSecond?: number;
  catalog?: ModelCatalog;
}): ModelVramBreakdown {
  const cat = getCatalog(input.catalog);
  const model = getCatalogModel(input.modelId, cat);
  const quantization = resolveQuantization(model, input.quantization, cat);
  const quant = model.quantizations[quantization];

  const contextLength =
    input.contextLength ?? cat.defaults.kv_cache_reference_context_tokens;
  const concurrentUsers = input.concurrentUsers ?? 1;
  const refContext = cat.defaults.kv_cache_reference_context_tokens;

  const kvCacheGiB =
    model.kv_cache_gib_per_user_at_4k *
    (contextLength / refContext) *
    concurrentUsers;
  const weightsGiB = quant.weights_gib;
  const overheadGiB = cat.defaults.system_overhead_gib;
  const totalGiB = weightsGiB + kvCacheGiB + overheadGiB;

  const { tier, vramGiB, exceedsSingleGpu } = minGpuTierForVram(totalGiB, cat);

  return {
    modelId: model.id,
    modelLabel: model.label,
    quantization,
    weightsGiB,
    kvCacheGiB,
    overheadGiB,
    totalGiB,
    contextLength,
    concurrentUsers,
    minGpuTier: tier,
    tierVramGiB: vramGiB,
    exceedsSingleGpu,
    tokensPerSecond:
      input.tokensPerSecond ?? model.default_tokens_per_second,
  };
}

export function eligibleGpuTiers(
  totalGiB: number,
  catalog?: ModelCatalog,
): GpuTierId[] {
  const cat = getCatalog(catalog);
  return GPU_TIER_ORDER.filter((tier) => cat.gpu_tier_vram_gib[tier] >= totalGiB);
}
