import type { GpuPriceSheet, ParseResult, Warning } from '../types';
import { computeModelVram } from '../catalog/resolve';
import { collectModelVramWarnings } from '../catalog/warnings';
import { sumGpuCount } from '../estimator/inference';

function modelFromAnnotations(
  annotations?: Record<string, string>,
): {
  modelId: string;
  quantization?: string;
  contextLength?: number;
  concurrentUsers?: number;
} | null {
  if (!annotations) return null;
  const modelId = annotations['podmonkey.io/model'];
  if (!modelId) return null;
  const quant = annotations['podmonkey.io/quantization'];
  const ctx = annotations['podmonkey.io/context-length'];
  const users = annotations['podmonkey.io/concurrent-users'];
  return {
    modelId,
    quantization: quant,
    contextLength: ctx ? Number.parseInt(ctx, 10) : undefined,
    concurrentUsers: users ? Number.parseInt(users, 10) : undefined,
  };
}

export function collectWarnings(
  parse: ParseResult,
  gpuSheets: GpuPriceSheet[] = [],
): Warning[] {
  const warnings: Warning[] = [];

  for (const w of parse.workloads) {
    const ref = `${w.namespace}/${w.kind}/${w.name}`;

    for (const c of w.containers) {
      const cref = `${ref}/${c.name}`;
      if (c.usedDefaults) {
        warnings.push({
          id: 'BESTEFFORT_QOS',
          severity: 'warning',
          message:
            'No CPU/memory requests; using default minimum for cost estimate.',
          resource: cref,
        });
      } else if (c.usedLimitsAsProxy) {
        warnings.push({
          id: 'USED_LIMITS_AS_PROXY',
          severity: 'warning',
          message: 'Missing requests; using limits as cost proxy.',
          resource: cref,
        });
      }
      if (c.cpuCores > 4) {
        warnings.push({
          id: 'HIGH_CPU_REQUEST',
          severity: 'info',
          message: `High CPU request: ${c.cpuCores} cores.`,
          resource: cref,
        });
      }
      if (c.memoryGiB > 8) {
        warnings.push({
          id: 'HIGH_MEM_REQUEST',
          severity: 'info',
          message: `High memory request: ${c.memoryGiB.toFixed(2)} GiB.`,
          resource: cref,
        });
      }
      if (c.gpuCount > 0) {
        warnings.push({
          id: 'GPU_REQUEST',
          severity: 'info',
          message: `Requests ${c.gpuCount} GPU(s) — estimate uses GPU node floor when pricing available.`,
          resource: cref,
        });
      }
      if (c.image.endsWith(':latest') || !c.image.includes(':')) {
        warnings.push({
          id: 'IMAGE_LATEST',
          severity: 'warning',
          message: `Unpinned image tag: ${c.image || '(empty)'}`,
          resource: cref,
        });
      }
    }

    if (
      (w.kind === 'Deployment' || w.kind === 'StatefulSet') &&
      w.replicas === 1
    ) {
      warnings.push({
        id: 'SINGLE_REPLICA',
        severity: 'info',
        message: 'Single replica — no HA.',
        resource: ref,
      });
    }

    const modelSpec = modelFromAnnotations(w.annotations);
    const gpuContainers = w.containers.filter((c) => c.gpuCount > 0);
    if (modelSpec && gpuContainers.length > 0) {
      try {
        const vram = computeModelVram({
          modelId: modelSpec.modelId,
          quantization: modelSpec.quantization,
          contextLength: modelSpec.contextLength,
          concurrentUsers: modelSpec.concurrentUsers,
        });
        warnings.push(
          ...collectModelVramWarnings(vram).map((warn) => ({
            ...warn,
            resource: ref,
          })),
        );
      } catch (e) {
        warnings.push({
          id: 'UNKNOWN_MODEL',
          severity: 'warning',
          message: e instanceof Error ? e.message : String(e),
          resource: ref,
        });
      }
    }
  }

  const lbCount = parse.services.filter((s) => s.type === 'LoadBalancer').length;
  if (lbCount > 0) {
    warnings.push({
      id: 'LOADBALANCER_COUNT',
      severity: 'info',
      message: `${lbCount} LoadBalancer service(s) add flat monthly fees.`,
    });
  }

  if (parse.ingresses.length > 0) {
    warnings.push({
      id: 'INGRESS_COUNT',
      severity: 'info',
      message: `${parse.ingresses.length} Ingress resource(s) may add LB/controller fees on cloud providers.`,
    });
  }

  const totalGpus = sumGpuCount(parse);
  if (totalGpus > 0) {
    const covered = new Set(gpuSheets.map((s) => s.provider));
    if (covered.size === 0) {
      warnings.push({
        id: 'GPU_NO_PRICING',
        severity: 'warning',
        message:
          'Workload requests GPUs but no GPU price sheets are loaded — GPU cost not included.',
      });
    }
  }

  return warnings;
}
