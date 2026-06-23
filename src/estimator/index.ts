import type {
  CostLineItem,
  EstimateOptions,
  EstimateResult,
  GpuPriceSheet,
  ParsedWorkload,
  ParseResult,
  PriceSheet,
  ProviderEstimate,
  ProviderId,
  WorkloadSummary,
} from '../types';
import { assessConfidence } from '../pricing/confidence';
import { resolveRates } from '../pricing/derive-rates';
import { computeGpuFloorMonthly } from './inference';
import { computeNodeFloorMonthly } from '../pricing/node-floor';
import { storageRateGiBMonth } from '../pricing/storage-rate';
import { roundUsd } from '../units';
import { collectWarnings } from '../warnings/index';

function workloadTotals(workload: ParsedWorkload): {
  cpuCores: number;
  memoryGiB: number;
  gpuCount: number;
} {
  let cpuCores = 0;
  let memoryGiB = 0;
  let gpuCount = 0;
  for (const c of workload.containers) {
    cpuCores += c.cpuCores * workload.replicas;
    memoryGiB += c.memoryGiB * workload.replicas;
    gpuCount += c.gpuCount * workload.replicas;
  }
  return { cpuCores, memoryGiB, gpuCount };
}

function sumWorkloadResources(parse: ParseResult): {
  cpuCores: number;
  memoryGiB: number;
  gpuCount: number;
} {
  let cpuCores = 0;
  let memoryGiB = 0;
  let gpuCount = 0;

  for (const w of parse.workloads) {
    for (const c of w.containers) {
      cpuCores += c.cpuCores * w.replicas;
      memoryGiB += c.memoryGiB * w.replicas;
      gpuCount += c.gpuCount * w.replicas;
    }
  }

  return { cpuCores, memoryGiB, gpuCount };
}

function computeMarginalMonthly(
  cpuCores: number,
  memoryGiB: number,
  sheet: PriceSheet,
): number {
  const rates = resolveRates(sheet);
  const h = sheet.hours_per_month;
  return roundUsd(
    cpuCores * h * rates.cpu_per_vcpu_hour_usd +
      memoryGiB * h * rates.memory_per_gib_hour_usd,
  );
}

function computeCostRange(
  cpuCores: number,
  memoryGiB: number,
  sheet: PriceSheet,
  minNodes: number,
): { min: number; max: number; nodes: number; instanceType: string } {
  const marginal = computeMarginalMonthly(cpuCores, memoryGiB, sheet);
  const { nodes, monthlyUsd: nodeFloor, instanceType } = computeNodeFloorMonthly(
    cpuCores,
    memoryGiB,
    sheet,
    minNodes,
  );

  if (sheet.compute_model === 'node_only') {
    return { min: nodeFloor, max: nodeFloor, nodes, instanceType };
  }

  return {
    min: Math.min(marginal, nodeFloor),
    max: Math.max(marginal, nodeFloor),
    nodes,
    instanceType,
  };
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

function storageCostMonthly(parse: ParseResult, sheet: PriceSheet): number {
  return roundUsd(
    parse.pvcs.reduce((sum, pvc) => {
      const rate = storageRateGiBMonth(sheet, pvc.storageClass);
      return sum + pvc.storageGiB * rate;
    }, 0),
  );
}

export function estimateForProvider(
  parse: ParseResult,
  sheet: PriceSheet,
  options: EstimateOptions = {},
  gpuSheets: GpuPriceSheet[] = [],
): ProviderEstimate {
  const { cpuCores, memoryGiB, gpuCount } = sumWorkloadResources(parse);
  const minNodes = options.minNodes ?? 1;

  const gpuSheet = gpuSheets.find((g) => g.provider === sheet.provider);
  let compute = computeCostRange(cpuCores, memoryGiB, sheet, minNodes);
  let nodeInstance = compute.instanceType;
  let gpuInstanceType: string | undefined;
  let gpuNodes = compute.nodes;

  const lineItems: CostLineItem[] = [];

  if (gpuCount > 0 && gpuSheet) {
    const gpuFloor = computeGpuFloorMonthly(
      gpuCount,
      cpuCores,
      memoryGiB,
      gpuSheet,
      minNodes,
    );
    gpuInstanceType = gpuFloor.instanceType;
    gpuNodes = gpuFloor.nodes;
    nodeInstance = gpuFloor.instanceType;

    const cpuMarginal = computeMarginalMonthly(cpuCores, memoryGiB, sheet);
    const gpuMonthly = gpuFloor.monthlyUsd;

    if (sheet.compute_model === 'node_only') {
      compute = {
        min: gpuMonthly,
        max: gpuMonthly,
        nodes: gpuFloor.nodes,
        instanceType: gpuFloor.instanceType,
      };
    } else {
      compute = {
        min: Math.min(cpuMarginal, gpuMonthly),
        max: Math.max(cpuMarginal, gpuMonthly),
        nodes: gpuFloor.nodes,
        instanceType: gpuFloor.instanceType,
      };
    }

    lineItems.push({
      category: 'gpu',
      label: `GPU nodes (×${gpuFloor.nodes} ${gpuFloor.instanceType}, ${gpuFloor.gpuModel})`,
      monthlyUsd: gpuMonthly,
    });
  } else {
    const computeLabel =
      sheet.compute_model === 'node_only'
        ? `Compute (nodes × ${nodeInstance})`
        : `Compute (requests .. ${compute.nodes}× ${nodeInstance})`;

    lineItems.push({
      category: 'compute',
      label: computeLabel,
      monthlyUsd: compute.max,
      monthlyUsdRange:
        compute.min !== compute.max
          ? { min: compute.min, max: compute.max }
          : undefined,
    });
  }

  const storageCost = storageCostMonthly(parse, sheet);

  const lbCount = parse.services.filter((s) => s.type === 'LoadBalancer').length;
  const lbCost = roundUsd(lbCount * sheet.load_balancer_monthly_usd);

  const ingressCount = parse.ingresses.length;
  const ingressRate = sheet.ingress_lb_monthly_usd ?? 0;
  const ingressCost = roundUsd(ingressCount * ingressRate);

  const cpCost = controlPlaneMonthly(sheet, options);

  const fixedOverhead = roundUsd(storageCost + lbCost + ingressCost + cpCost);
  const totalMin = roundUsd(compute.min + fixedOverhead);
  const totalMax = roundUsd(compute.max + fixedOverhead);

  lineItems.push(
    {
      category: 'storage',
      label: 'Persistent volumes',
      monthlyUsd: storageCost,
    },
    {
      category: 'load_balancer',
      label: `Load balancers (×${lbCount})`,
      monthlyUsd: lbCost,
    },
    ...(ingressCount > 0
      ? [
          {
            category: 'ingress' as const,
            label: `Ingress (×${ingressCount})`,
            monthlyUsd: ingressCost,
          },
        ]
      : []),
    {
      category: 'control_plane',
      label: `${sheet.service} control plane`,
      monthlyUsd: cpCost,
    },
  );

  return {
    provider: sheet.provider,
    region: sheet.region,
    asOf: sheet.as_of,
    totalMonthlyUsd: totalMax,
    totalMonthlyUsdRange: { min: totalMin, max: totalMax },
    computeMonthlyUsdRange: {
      min: compute.min,
      max: compute.max,
    },
    nodeCount: gpuNodes,
    nodeInstanceType: nodeInstance,
    gpuInstanceType,
    gpuCount: gpuCount > 0 ? gpuCount : undefined,
    lineItems,
  };
}

export function estimate(
  parse: ParseResult,
  sheets: PriceSheet[],
  options: EstimateOptions = {},
  gpuSheets: GpuPriceSheet[] = [],
): EstimateResult {
  const { cpuCores, memoryGiB, gpuCount } = sumWorkloadResources(parse);
  const storageGiB = parse.pvcs.reduce((s, p) => s + p.storageGiB, 0);
  const loadBalancerCount = parse.services.filter(
    (s) => s.type === 'LoadBalancer',
  ).length;
  const ingressCount = parse.ingresses.length;

  const warnings = collectWarnings(parse, gpuSheets);
  const confidence = assessConfidence(parse);

  const providers = sheets.map((sheet) =>
    estimateForProvider(parse, sheet, options, gpuSheets),
  );

  const workloads: WorkloadSummary[] = parse.workloads.map((w) => {
    const { cpuCores: wCpu, memoryGiB: wMem, gpuCount: wGpu } =
      workloadTotals(w);
    const computeMonthlyUsdRange: Partial<
      Record<ProviderId, { min: number; max: number }>
    > = {};
    for (const sheet of sheets) {
      const range = computeCostRange(wCpu, wMem, sheet, options.minNodes ?? 1);
      computeMonthlyUsdRange[sheet.provider] = {
        min: range.min,
        max: range.max,
      };
    }
    return {
      kind: w.kind,
      name: w.name,
      namespace: w.namespace,
      replicas: w.replicas,
      cpuCores: wCpu,
      memoryGiB: wMem,
      gpuCount: wGpu,
      computeMonthlyUsdRange,
    };
  });

  return {
    providers,
    warnings,
    workloads,
    confidence,
    totals: {
      cpuCores,
      memoryGiB,
      gpuCount,
      storageGiB,
      loadBalancerCount,
      ingressCount,
    },
  };
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  aws: 'AWS EKS',
  gcp: 'Google GKE',
  azure: 'Azure AKS',
  hetzner: 'Hetzner (k3s)',
};
