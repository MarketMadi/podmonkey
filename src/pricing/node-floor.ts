import type { PriceSheet } from '../types';
import { roundUsd } from '../units';

export function nodesNeeded(
  totalCpu: number,
  totalMemGiB: number,
  instance: Pick<PriceSheet['reference_instance'], 'vcpu' | 'memory_gib'>,
  minNodes = 1,
): number {
  if (totalCpu <= 0 && totalMemGiB <= 0) return minNodes;
  return Math.max(
    minNodes,
    Math.ceil(totalCpu / instance.vcpu) || 0,
    Math.ceil(totalMemGiB / instance.memory_gib) || 0,
  );
}

export function computeNodeFloorMonthly(
  totalCpu: number,
  totalMemGiB: number,
  sheet: PriceSheet,
  minNodes = 1,
): { nodes: number; monthlyUsd: number } {
  const inst = sheet.reference_instance;
  const nodes = nodesNeeded(totalCpu, totalMemGiB, inst, minNodes);
  const monthlyUsd = roundUsd(
    nodes * inst.hourly_usd * sheet.hours_per_month,
  );
  return { nodes, monthlyUsd };
}
