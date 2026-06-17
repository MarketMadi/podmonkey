import type {
  CostLineItem,
  EstimateOptions,
  EstimateResult,
  ParsedWorkload,
  ParseResult,
  PriceSheet,
  ProviderEstimate,
  ProviderId,
  WorkloadSummary,
} from '../types';
import { roundUsd } from '../units';
import { collectWarnings } from '../warnings/index';

function storageRateGiBMonth(sheet: PriceSheet): number {
  const s = sheet.storage;
  const key = Object.keys(s).find((k) => k.endsWith('_per_gib_month_usd'));
  if (key && typeof s[key] === 'number') return s[key] as number;
  return 0.08;
}

function workloadTotals(workload: ParsedWorkload): {
  cpuCores: number;
  memoryGiB: number;
} {
  let cpuCores = 0;
  let memoryGiB = 0;
  for (const c of workload.containers) {
    cpuCores += c.cpuCores * workload.replicas;
    memoryGiB += c.memoryGiB * workload.replicas;
  }
  return { cpuCores, memoryGiB };
}

function workloadComputeMonthly(
  workload: ParsedWorkload,
  sheet: PriceSheet,
): number {
  const { cpuCores, memoryGiB } = workloadTotals(workload);
  const h = sheet.hours_per_month;
  return roundUsd(
    cpuCores * h * sheet.rates.cpu_per_vcpu_hour_usd +
      memoryGiB * h * sheet.rates.memory_per_gib_hour_usd,
  );
}

function sumWorkloadResources(parse: ParseResult): {
  cpuCores: number;
  memoryGiB: number;
} {
  let cpuCores = 0;
  let memoryGiB = 0;

  for (const w of parse.workloads) {
    for (const c of w.containers) {
      cpuCores += c.cpuCores * w.replicas;
      memoryGiB += c.memoryGiB * w.replicas;
    }
  }

  return { cpuCores, memoryGiB };
}

function controlPlaneMonthly(
  sheet: PriceSheet,
  options: EstimateOptions,
): number {
  const h = sheet.hours_per_month;
  const cp = sheet.control_plane;

  if (sheet.provider === 'gcp' && options.gkeFreeTier && cp.free_zonal_cluster) {
    return 0;
  }
  if (sheet.provider === 'azure' && options.aksTier === 'standard') {
    return roundUsd((cp.standard_hourly_usd ?? 0.1) * h);
  }
  return roundUsd(cp.hourly_usd * h);
}

export function estimateForProvider(
  parse: ParseResult,
  sheet: PriceSheet,
  options: EstimateOptions = {},
): ProviderEstimate {
  const { cpuCores, memoryGiB } = sumWorkloadResources(parse);
  const h = sheet.hours_per_month;

  const computeCpu = roundUsd(
    cpuCores * h * sheet.rates.cpu_per_vcpu_hour_usd,
  );
  const computeMem = roundUsd(
    memoryGiB * h * sheet.rates.memory_per_gib_hour_usd,
  );

  const storageGiB = parse.pvcs.reduce((s, p) => s + p.storageGiB, 0);
  const storageRate = storageRateGiBMonth(sheet);
  const storageCost = roundUsd(storageGiB * storageRate);

  const lbCount = parse.services.filter((s) => s.type === 'LoadBalancer').length;
  const lbCost = roundUsd(lbCount * sheet.load_balancer_monthly_usd);

  const cpCost = controlPlaneMonthly(sheet, options);

  const lineItems: CostLineItem[] = [
    { category: 'compute', label: 'CPU (requests)', monthlyUsd: computeCpu },
    { category: 'compute', label: 'Memory (requests)', monthlyUsd: computeMem },
    { category: 'storage', label: 'Persistent volumes', monthlyUsd: storageCost },
    {
      category: 'load_balancer',
      label: `Load balancers (×${lbCount})`,
      monthlyUsd: lbCost,
    },
    {
      category: 'control_plane',
      label: `${sheet.service} control plane`,
      monthlyUsd: cpCost,
    },
  ];

  const totalMonthlyUsd = roundUsd(
    lineItems.reduce((sum, i) => sum + i.monthlyUsd, 0),
  );

  return {
    provider: sheet.provider,
    region: sheet.region,
    asOf: sheet.as_of,
    totalMonthlyUsd,
    lineItems,
  };
}

export function estimate(
  parse: ParseResult,
  sheets: PriceSheet[],
  options: EstimateOptions = {},
): EstimateResult {
  const { cpuCores, memoryGiB } = sumWorkloadResources(parse);
  const storageGiB = parse.pvcs.reduce((s, p) => s + p.storageGiB, 0);
  const loadBalancerCount = parse.services.filter(
    (s) => s.type === 'LoadBalancer',
  ).length;

  const warnings = collectWarnings(parse);

  const providers = sheets.map((sheet) =>
    estimateForProvider(parse, sheet, options),
  );

  const workloads: WorkloadSummary[] = parse.workloads.map((w) => {
    const { cpuCores: wCpu, memoryGiB: wMem } = workloadTotals(w);
    const computeMonthlyUsd: Partial<Record<ProviderId, number>> = {};
    for (const sheet of sheets) {
      computeMonthlyUsd[sheet.provider] = workloadComputeMonthly(w, sheet);
    }
    return {
      kind: w.kind,
      name: w.name,
      namespace: w.namespace,
      replicas: w.replicas,
      cpuCores: wCpu,
      memoryGiB: wMem,
      computeMonthlyUsd,
    };
  });

  return {
    providers,
    warnings,
    workloads,
    totals: { cpuCores, memoryGiB, storageGiB, loadBalancerCount },
  };
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  aws: 'AWS EKS',
  gcp: 'Google GKE',
  azure: 'Azure AKS',
  hetzner: 'Hetzner (k3s)',
};
