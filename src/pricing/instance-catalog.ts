import type { PriceSheet } from '../types';
import { nodesNeeded } from './node-floor';
import { roundUsd } from '../units';

export type CatalogInstance = Pick<
  PriceSheet['reference_instance'],
  'type' | 'vcpu' | 'memory_gib' | 'hourly_usd'
>;

export function instanceCatalog(sheet: PriceSheet): CatalogInstance[] {
  return sheet.instance_catalog ?? [sheet.reference_instance];
}

/** Pick the catalog VM with the lowest monthly node-floor cost for this workload. */
export function cheapestNodeFloor(
  totalCpu: number,
  totalMemGiB: number,
  sheet: PriceSheet,
  minNodes = 1,
): { nodes: number; monthlyUsd: number; instanceType: string } {
  const catalog = instanceCatalog(sheet);
  let best: { nodes: number; monthlyUsd: number; instanceType: string } | null =
    null;

  for (const inst of catalog) {
    const nodes = nodesNeeded(totalCpu, totalMemGiB, inst, minNodes);
    const monthlyUsd = roundUsd(
      nodes * inst.hourly_usd * sheet.hours_per_month,
    );
    if (!best || monthlyUsd < best.monthlyUsd) {
      best = { nodes, monthlyUsd, instanceType: inst.type };
    }
  }

  return best!;
}
