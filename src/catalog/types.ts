import type { GpuTierId } from '../types';

export interface ModelQuantization {
  weights_gib: number;
  source: string;
}

export interface CatalogModel {
  id: string;
  label: string;
  hf_id: string;
  parameters_b: number;
  quantizations: Record<string, ModelQuantization>;
  kv_cache_gib_per_user_at_4k: number;
  kv_cache_source: string;
  default_tokens_per_second: number;
  /** Optional override; else decode_tps × catalog prefill ratio */
  prefill_tokens_per_second?: number;
  recommended_gpu_tiers: GpuTierId[];
}

export interface ModelCatalog {
  schema_version: string;
  as_of: string;
  fetched_at: string;
  sources: string[];
  defaults: {
    system_overhead_gib: number;
    kv_cache_reference_context_tokens: number;
    default_quantization: string;
    /** Prefill throughput ≈ decode × this ratio (vLLM-style single-request). */
    prefill_vs_decode_speed_ratio: number;
    serverless_cold_start_seconds: number;
  };
  models: CatalogModel[];
  gpu_tier_vram_gib: Record<GpuTierId, number>;
}

export interface ModelVramBreakdown {
  modelId: string;
  modelLabel: string;
  quantization: string;
  weightsGiB: number;
  kvCacheGiB: number;
  overheadGiB: number;
  totalGiB: number;
  contextLength: number;
  concurrentUsers: number;
  minGpuTier: GpuTierId;
  tierVramGiB: number;
  /** True when total VRAM exceeds largest single-GPU tier in catalog */
  exceedsSingleGpu?: boolean;
  tokensPerSecond: number;
}
