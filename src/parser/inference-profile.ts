import { load } from 'js-yaml';
import { computeModelVram } from '../catalog/resolve';
import { gpuSecondsPerRequest } from '../estimator/gpu-time';
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
  const mode = String(value ?? 'auto').toLowerCase().trim();
  if (mode === 'serverless' || mode === 'pod' || mode === 'auto') return mode;
  throw new Error('spec.billing must be "auto", "serverless", or "pod"');
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
  const workers = Number(spec.workers ?? 1);

  if (!Number.isFinite(requestsPerDay) || requestsPerDay <= 0) {
    throw new Error('spec.requestsPerDay must be a positive number');
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

  const inputTokensPerRequest = optionalPositiveInt(
    spec.inputTokensPerRequest ?? spec.input_tokens_per_request,
  );
  const outputTokensPerRequest = optionalPositiveInt(
    spec.outputTokensPerRequest ?? spec.output_tokens_per_request,
  );

  let avgSecondsPerRequest = optionalPositiveNumber(
    spec.avgSecondsPerRequest ?? spec.avg_seconds_per_request,
  );

  if (
    avgSecondsPerRequest == null &&
    inputTokensPerRequest != null &&
    outputTokensPerRequest != null &&
    modelId
  ) {
    const draft: InferenceProfile = {
      name: 'draft',
      billing: asBilling(spec.billing ?? 'auto'),
      gpu: 't4-16gb',
      model: modelId,
      quantization,
      contextLength,
      concurrentUsers,
      tokensPerSecond,
      inputTokensPerRequest,
      outputTokensPerRequest,
      requestsPerDay,
      avgSecondsPerRequest: 1,
      workers: Math.floor(workers),
    };
    avgSecondsPerRequest = gpuSecondsPerRequest(
      draft,
      catalog,
      'serverless',
    );
  }

  if (avgSecondsPerRequest == null || avgSecondsPerRequest <= 0) {
    throw new Error(
      'Set spec.inputTokensPerRequest + spec.outputTokensPerRequest (recommended), or spec.avgSecondsPerRequest',
    );
  }

  if (!modelId) {
    throw new Error(
      'spec.model is required — pick a model like llama-3.1-8b for week-1 cost math',
    );
  }

  let gpu: GpuTierId;
  if (spec.gpu != null) {
    gpu = asGpuTier(spec.gpu);
  } else {
    const vram = computeModelVram({
      modelId,
      quantization,
      contextLength,
      concurrentUsers,
      tokensPerSecond,
      catalog,
    });
    gpu = vram.minGpuTier;
  }

  return {
    name: (meta.name as string) ?? 'inference',
    billing: asBilling(spec.billing ?? 'auto'),
    gpu,
    model: modelId,
    quantization,
    contextLength,
    concurrentUsers,
    tokensPerSecond,
    inputTokensPerRequest,
    outputTokensPerRequest,
    requestsPerDay,
    avgSecondsPerRequest,
    workers: Math.floor(workers),
  };
}
