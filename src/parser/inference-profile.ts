import { load } from 'js-yaml';
import { computeModelVram } from '../catalog/resolve';
import type { GpuTierId, InferenceBillingMode, InferenceProfile } from '../types';

const GPU_TIERS = new Set<GpuTierId>([
  't4-16gb',
  'l4-24gb',
  'a10g-24gb',
  'rtx4090-24gb',
  'a100-40gb',
  'a100-80gb',
  'h100-80gb',
]);

export function isInferenceProfileYaml(yaml: string): boolean {
  const trimmed = yaml.trim();
  return (
    /kind:\s*InferenceEstimate/i.test(trimmed) ||
    /apiVersion:\s*podmonkey\.io\//i.test(trimmed)
  );
}

function asGpuTier(value: unknown): GpuTierId {
  const id = String(value).toLowerCase().trim() as GpuTierId;
  if (!GPU_TIERS.has(id)) {
    throw new Error(
      `Unknown gpu tier "${value}". Use one of: ${[...GPU_TIERS].join(', ')}`,
    );
  }
  return id;
}

function asBilling(value: unknown): InferenceBillingMode {
  const mode = String(value).toLowerCase().trim();
  if (mode === 'serverless' || mode === 'pod') return mode;
  throw new Error('spec.billing must be "serverless" or "pod"');
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive number, got ${value}`);
  }
  return Math.floor(n);
}

function optionalPositiveNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive number, got ${value}`);
  }
  return n;
}

export function parseInferenceProfile(
  yaml: string,
  catalog?: import('../catalog/types').ModelCatalog,
): InferenceProfile {
  const doc = load(yaml) as Record<string, unknown>;
  if (!doc || typeof doc !== 'object') {
    throw new Error('Inference profile must be a YAML object');
  }

  const kind = doc.kind as string | undefined;
  if (kind && kind !== 'InferenceEstimate') {
    throw new Error(`Expected kind InferenceEstimate, got ${kind}`);
  }

  const meta = (doc.metadata as Record<string, unknown>) ?? {};
  const spec = (doc.spec as Record<string, unknown>) ?? {};

  const requestsPerDay = Number(spec.requestsPerDay ?? spec.requests_per_day);
  const avgSecondsPerRequest = Number(
    spec.avgSecondsPerRequest ?? spec.avg_seconds_per_request,
  );
  const workers = Number(spec.workers ?? 1);

  if (!Number.isFinite(requestsPerDay) || requestsPerDay <= 0) {
    throw new Error('spec.requestsPerDay must be a positive number');
  }
  if (!Number.isFinite(avgSecondsPerRequest) || avgSecondsPerRequest <= 0) {
    throw new Error('spec.avgSecondsPerRequest must be a positive number');
  }
  if (!Number.isFinite(workers) || workers < 1) {
    throw new Error('spec.workers must be >= 1');
  }

  const modelId = spec.model != null ? String(spec.model).trim() : undefined;
  const quantization =
    spec.quantization != null ? String(spec.quantization).trim() : undefined;
  const contextLength = optionalPositiveInt(
    spec.contextLength ?? spec.context_length,
  );
  const concurrentUsers = optionalPositiveInt(
    spec.concurrentUsers ?? spec.concurrent_users,
  );
  const tokensPerSecond = optionalPositiveNumber(
    spec.tokensPerSecond ?? spec.tokens_per_second,
  );

  let gpu: GpuTierId;
  if (spec.gpu != null) {
    gpu = asGpuTier(spec.gpu);
  } else if (modelId) {
    const vram = computeModelVram({
      modelId,
      quantization,
      contextLength,
      concurrentUsers,
      tokensPerSecond,
      catalog,
    });
    gpu = vram.minGpuTier;
  } else {
    throw new Error(
      'spec.model or spec.gpu is required — use model for auto GPU tier selection',
    );
  }

  return {
    name: (meta.name as string) ?? 'inference',
    billing: asBilling(spec.billing ?? 'serverless'),
    gpu,
    model: modelId,
    quantization,
    contextLength,
    concurrentUsers,
    tokensPerSecond,
    requestsPerDay,
    avgSecondsPerRequest,
    workers: Math.floor(workers),
  };
}
