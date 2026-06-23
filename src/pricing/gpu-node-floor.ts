import type { GpuPriceSheet } from '../types';
import { roundUsd } from '../units';

export function cheapestGpuNodeFloor(
  totalGpus: number,
  totalCpu: number,
  totalMemGiB: number,
  sheet: GpuPriceSheet,
  minNodes = 1,
): { nodes: number; monthlyUsd: number; instanceType: string; gpuModel: string } {
  if (totalGpus <= 0) {
    throw new Error('cheapestGpuNodeFloor requires totalGpus > 0');
  }

  let best: {
    nodes: number;
    monthlyUsd: number;
    instanceType: string;
    gpuModel: string;
  } | null = null;

  for (const inst of sheet.instances) {
    const nodesForGpu = Math.ceil(totalGpus / inst.gpu_count);
    const nodesForCpu =
      totalCpu > 0 ? Math.ceil(totalCpu / inst.vcpu) : 0;
    const nodesForMem =
      totalMemGiB > 0 ? Math.ceil(totalMemGiB / inst.memory_gib) : 0;
    const nodes = Math.max(minNodes, nodesForGpu, nodesForCpu, nodesForMem);
    const monthlyUsd = roundUsd(nodes * inst.hourly_usd * sheet.hours_per_month);

    if (!best || monthlyUsd < best.monthlyUsd) {
      best = {
        nodes,
        monthlyUsd,
        instanceType: inst.type,
        gpuModel: inst.gpu_model,
      };
    }
  }

  if (!best) {
    throw new Error(`No GPU instance catalog for ${sheet.provider}`);
  }

  return best;
}
