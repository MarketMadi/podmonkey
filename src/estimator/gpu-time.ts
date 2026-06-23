import type { InferenceBillingMode, InferenceProfile } from '../types';
import { getCatalogModel } from '../catalog/resolve';
import type { ModelCatalog } from '../catalog/types';

const DEFAULT_PREFILL_RATIO = 8;
const DEFAULT_COLD_START_SEC = 0.3;

export interface GpuTimingInput {
  inputTokens: number;
  outputTokens: number;
  decodeTokensPerSecond: number;
  prefillTokensPerSecond: number;
  billing: InferenceBillingMode;
  coldStartSeconds?: number;
}

export interface GpuTimingBreakdown {
  prefillSeconds: number;
  decodeSeconds: number;
  coldStartSeconds: number;
  totalSeconds: number;
}

export function resolveModelThroughput(
  profile: Pick<
    InferenceProfile,
    | 'model'
    | 'quantization'
    | 'contextLength'
    | 'concurrentUsers'
    | 'tokensPerSecond'
  >,
  catalog?: ModelCatalog,
): { decodeTps: number; prefillTps: number } {
  if (!profile.model) {
    const decodeTps = profile.tokensPerSecond ?? 30;
    return {
      decodeTps,
      prefillTps: decodeTps * DEFAULT_PREFILL_RATIO,
    };
  }

  const cat = catalog;
  const model = getCatalogModel(profile.model, cat);
  const decodeTps =
    profile.tokensPerSecond ?? model.default_tokens_per_second;
  const ratio =
    cat?.defaults.prefill_vs_decode_speed_ratio ?? DEFAULT_PREFILL_RATIO;
  const modelPrefill = model.prefill_tokens_per_second;
  const prefillTps = modelPrefill ?? decodeTps * ratio;

  return { decodeTps, prefillTps };
}

export function gpuTimingBreakdown(input: GpuTimingInput): GpuTimingBreakdown {
  const prefillSeconds = input.inputTokens / input.prefillTokensPerSecond;
  const decodeSeconds = input.outputTokens / input.decodeTokensPerSecond;
  const coldStartSeconds =
    input.billing === 'serverless'
      ? (input.coldStartSeconds ?? DEFAULT_COLD_START_SEC)
      : 0;

  return {
    prefillSeconds,
    decodeSeconds,
    coldStartSeconds,
    totalSeconds: prefillSeconds + decodeSeconds + coldStartSeconds,
  };
}

export function gpuSecondsPerRequest(
  profile: InferenceProfile,
  catalog?: ModelCatalog,
  billing: InferenceBillingMode = profile.billing,
): number {
  const input = profile.inputTokensPerRequest ?? 0;
  const output = profile.outputTokensPerRequest ?? 0;

  if (input > 0 && output > 0) {
    const { decodeTps, prefillTps } = resolveModelThroughput(profile, catalog);
    const cold =
      catalog?.defaults.serverless_cold_start_seconds ??
      DEFAULT_COLD_START_SEC;
    return gpuTimingBreakdown({
      inputTokens: input,
      outputTokens: output,
      decodeTokensPerSecond: decodeTps,
      prefillTokensPerSecond: prefillTps,
      billing,
      coldStartSeconds: cold,
    }).totalSeconds;
  }

  return profile.avgSecondsPerRequest;
}

/** GPU busy-time % when paying for an always-on pod. */
export function gpuPodUtilizationPercent(
  computeSecondsPerMonth: number,
  workers: number,
  hoursPerMonth: number,
): number {
  const available = hoursPerMonth * 3600 * workers;
  if (available <= 0) return 0;
  return Math.min(100, (computeSecondsPerMonth / available) * 100);
}
