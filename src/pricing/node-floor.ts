import type { PriceSheet } from '../types';
import { cheapestNodeFloor } from './instance-catalog';

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
): { nodes: number; monthlyUsd: number; instanceType: string } {
  return cheapestNodeFloor(totalCpu, totalMemGiB, sheet, minNodes);
}
