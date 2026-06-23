import type { GpuTierId, Warning } from '../types';
import { computeModelVram, eligibleGpuTiers } from './resolve';
import type { ModelVramBreakdown } from './types';

export function collectModelVramWarnings(
  vram: ModelVramBreakdown,
  assignedGpu?: GpuTierId,
): Warning[] {
  const warnings: Warning[] = [];

  if (vram.totalGiB > vram.tierVramGiB || vram.exceedsSingleGpu) {
    warnings.push({
      id: 'MODEL_EXCEEDS_VRAM',
      severity: 'error',
      message: vram.exceedsSingleGpu
        ? `${vram.modelLabel} needs ~${vram.totalGiB.toFixed(0)} GiB VRAM — exceeds any single GPU tier (max ${vram.tierVramGiB} GiB). Plan for multi-GPU cluster or use API hosting.`
        : `${vram.modelLabel} needs ~${vram.totalGiB.toFixed(1)} GiB VRAM but ${assignedGpu ?? vram.minGpuTier} has ${vram.tierVramGiB} GiB. Use a larger GPU, lower quant, or shorter context.`,
    });
  }

  const kvShare = vram.kvCacheGiB / vram.totalGiB;
  if (kvShare > 0.4 && vram.concurrentUsers > 1) {
    warnings.push({
      id: 'KV_CACHE_TIGHT',
      severity: 'warning',
      message: `KV cache is ${(kvShare * 100).toFixed(0)}% of VRAM (${vram.kvCacheGiB.toFixed(1)} GiB for ${vram.concurrentUsers} users @ ${vram.contextLength} ctx). Consider shorter context or more GPUs.`,
    });
  }

  const headroom = vram.tierVramGiB - vram.totalGiB;
  if (headroom > 20 && vram.totalGiB < vram.tierVramGiB * 0.5) {
    warnings.push({
      id: 'GPU_OVERPROVISIONED',
      severity: 'info',
      message: `Model uses ~${vram.totalGiB.toFixed(1)} GiB on a ${vram.tierVramGiB} GiB GPU (${headroom.toFixed(0)} GiB idle). A smaller tier may be cheaper.`,
    });
  }

  if (assignedGpu && assignedGpu !== vram.minGpuTier) {
    const eligible = eligibleGpuTiers(vram.totalGiB);
    if (!eligible.includes(assignedGpu)) {
      warnings.push({
        id: 'GPU_TIER_MISMATCH',
        severity: 'warning',
        message: `Manual GPU ${assignedGpu} may not fit ${vram.modelLabel}. Minimum tier: ${vram.minGpuTier}.`,
      });
    }
  }

  return warnings;
}
