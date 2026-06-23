import { computeModelVram } from '../catalog/resolve';
import { collectModelVramWarnings } from '../catalog/warnings';
import type {
  GpuPriceSheet,
  InferenceEstimateResult,
  InferenceProfile,
  MarketplacePriceSheet,
  MarketplaceProviderEstimate,
  ProviderId,
  Warning,
} from '../types';
import { cheapestGpuNodeFloor } from '../pricing/gpu-node-floor';
import { roundUsd } from '../units';

const DAYS_PER_MONTH = 30;

export function sumGpuCount(parse: {
  workloads: Array<{
    replicas: number;
    containers: Array<{ gpuCount: number }>;
  }>;
}): number {
  let total = 0;
  for (const w of parse.workloads) {
    for (const c of w.containers) {
      total += c.gpuCount * w.replicas;
    }
  }
  return total;
}

export function gpuSheetForProvider(
  provider: ProviderId,
  sheets: GpuPriceSheet[],
): GpuPriceSheet | undefined {
  return sheets.find((s) => s.provider === provider);
}

export function computeGpuFloorMonthly(
  totalGpus: number,
  totalCpu: number,
  totalMemGiB: number,
  sheet: GpuPriceSheet,
  minNodes: number,
): { monthlyUsd: number; nodes: number; instanceType: string; gpuModel: string } {
  return cheapestGpuNodeFloor(totalGpus, totalCpu, totalMemGiB, sheet, minNodes);
}

function tierForSheet(
  sheet: MarketplacePriceSheet,
  gpu: InferenceProfile['gpu'],
) {
  const tier = sheet.tiers.find((t) => t.id === gpu);
  if (!tier) {
    throw new Error(`${sheet.provider} has no pricing for gpu tier ${gpu}`);
  }
  return tier;
}

export function tokensPerMonth(
  profile: InferenceProfile,
  catalog?: import('../catalog/types').ModelCatalog,
): number {
  const tps =
    profile.tokensPerSecond ??
    (profile.model
      ? computeModelVram({
          modelId: profile.model,
          quantization: profile.quantization,
          contextLength: profile.contextLength,
          concurrentUsers: profile.concurrentUsers,
          catalog,
        }).tokensPerSecond
      : 30);

  const tokensPerRequest = profile.avgSecondsPerRequest * tps;
  return profile.requestsPerDay * DAYS_PER_MONTH * tokensPerRequest;
}

export function usdPerMillionTokens(
  monthlyUsd: number,
  profile: InferenceProfile,
  catalog?: import('../catalog/types').ModelCatalog,
): number | null {
  const tpm = tokensPerMonth(profile, catalog);
  if (tpm <= 0) return null;
  return roundUsd((monthlyUsd / tpm) * 1_000_000);
}

/** Requests/day where serverless monthly cost equals pod monthly cost. */
export function podBreakEvenRequestsPerDay(
  tier: {
    serverless_per_second_usd: number | null;
    pod_per_hour_usd: number | null;
  },
  profile: Pick<InferenceProfile, 'avgSecondsPerRequest' | 'workers'>,
  hoursPerMonth: number,
): number | null {
  const { serverless_per_second_usd: perSec, pod_per_hour_usd: perHr } = tier;
  if (perSec == null || perHr == null || perSec <= 0 || perHr <= 0) {
    return null;
  }
  const podMonthly = perHr * hoursPerMonth * profile.workers;
  const secPerDayAtBreakEven =
    podMonthly / (DAYS_PER_MONTH * perSec * profile.workers);
  return Math.ceil(secPerDayAtBreakEven / profile.avgSecondsPerRequest);
}

function estimateMarketplaceProvider(
  profile: InferenceProfile,
  sheet: MarketplacePriceSheet,
  catalog?: import('../catalog/types').ModelCatalog,
): MarketplaceProviderEstimate {
  const tier = tierForSheet(sheet, profile.gpu);
  const requestsPerMonth = profile.requestsPerDay * DAYS_PER_MONTH;
  const computeSecondsPerMonth =
    requestsPerMonth * profile.avgSecondsPerRequest * profile.workers;

  let monthlyUsd: number;
  let label: string;

  if (profile.billing === 'serverless') {
    if (tier.serverless_per_second_usd == null) {
      throw new Error(
        `${sheet.provider} does not publish serverless pricing for ${tier.id}`,
      );
    }
    monthlyUsd = roundUsd(
      computeSecondsPerMonth * tier.serverless_per_second_usd,
    );
    label = `Serverless GPU (${tier.label})`;
  } else {
    if (tier.pod_per_hour_usd == null) {
      throw new Error(
        `${sheet.provider} does not publish pod/VM pricing for ${tier.id}`,
      );
    }
    monthlyUsd = roundUsd(
      tier.pod_per_hour_usd * sheet.hours_per_month * profile.workers,
    );
    label = `GPU pod/VM (${tier.label}, ×${profile.workers})`;
  }

  return {
    provider: sheet.provider,
    asOf: sheet.as_of,
    totalMonthlyUsd: monthlyUsd,
    matchedTier: tier.label,
    billing: profile.billing,
    usdPerMillionTokens: usdPerMillionTokens(monthlyUsd, profile, catalog),
    podBreakEvenRequestsPerDay: podBreakEvenRequestsPerDay(
      tier,
      profile,
      sheet.hours_per_month,
    ),
    lineItems: [
      {
        category: 'gpu',
        label,
        monthlyUsd,
      },
    ],
  };
}

export function collectInferenceWarnings(
  profile: InferenceProfile,
  catalog?: import('../catalog/types').ModelCatalog,
): Warning[] {
  const warnings: Warning[] = [];

  if (profile.model) {
    const vram = computeModelVram({
      modelId: profile.model,
      quantization: profile.quantization,
      contextLength: profile.contextLength,
      concurrentUsers: profile.concurrentUsers,
      tokensPerSecond: profile.tokensPerSecond,
      catalog,
    });
    warnings.push(...collectModelVramWarnings(vram, profile.gpu));
  }

  if (profile.billing === 'serverless' && profile.avgSecondsPerRequest < 1) {
    warnings.push({
      id: 'SHORT_REQUESTS',
      severity: 'info',
      message:
        'Sub-second requests may under-estimate cold-start overhead on serverless.',
    });
  }

  if (profile.workers === 1) {
    warnings.push({
      id: 'SINGLE_WORKER',
      severity: 'info',
      message: 'Single worker — no redundancy for production traffic.',
    });
  }

  if (profile.requestsPerDay > 100_000) {
    warnings.push({
      id: 'HIGH_TRAFFIC',
      severity: 'info',
      message:
        'High request volume — consider pod/always-on billing if utilization stays high.',
    });
  }

  return warnings;
}

export function estimateInference(
  profile: InferenceProfile,
  sheets: MarketplacePriceSheet[],
  catalog?: import('../catalog/types').ModelCatalog,
): InferenceEstimateResult {
  const providers: MarketplaceProviderEstimate[] = [];
  const errors: string[] = [];

  for (const sheet of sheets) {
    try {
      providers.push(estimateMarketplaceProvider(profile, sheet, catalog));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (providers.length === 0) {
    throw new Error(
      `No marketplace estimates for ${profile.gpu}:\n${errors.join('\n')}`,
    );
  }

  const warnings = collectInferenceWarnings(profile, catalog);

  // Serverless ↔ pod break-even hints (cheapest provider with both rates)
  const withBreakEven = providers.filter(
    (p) => p.podBreakEvenRequestsPerDay != null,
  );
  if (withBreakEven.length > 0) {
    const ref = withBreakEven[0];
    const breakEven = ref.podBreakEvenRequestsPerDay!;
    if (profile.billing === 'serverless' && profile.requestsPerDay >= breakEven) {
      warnings.push({
        id: 'POD_CHEAPER',
        severity: 'info',
        message: `At ${profile.requestsPerDay.toLocaleString()} req/day you're above the ~${breakEven.toLocaleString()} req/day break-even on ${MARKETPLACE_LABELS[ref.provider]} — pod billing may be cheaper.`,
      });
    } else if (
      profile.billing === 'pod' &&
      profile.requestsPerDay < breakEven
    ) {
      warnings.push({
        id: 'SERVERLESS_CHEAPER',
        severity: 'info',
        message: `Below ~${breakEven.toLocaleString()} req/day, serverless on ${MARKETPLACE_LABELS[ref.provider]} is likely cheaper than always-on pods.`,
      });
    }
  }

  if (errors.length > 0) {
    warnings.push({
      id: 'PARTIAL_PROVIDERS',
      severity: 'info',
      message: `Some providers omitted: ${errors.join('; ')}`,
    });
  }

  const requestsPerMonth = profile.requestsPerDay * DAYS_PER_MONTH;
  const tpm = tokensPerMonth(profile, catalog);
  const cheapest = providers.reduce((a, b) =>
    a.totalMonthlyUsd < b.totalMonthlyUsd ? a : b,
  );

  let modelSummary: InferenceEstimateResult['model'];
  if (profile.model) {
    const vram = computeModelVram({
      modelId: profile.model,
      quantization: profile.quantization,
      contextLength: profile.contextLength,
      concurrentUsers: profile.concurrentUsers,
      tokensPerSecond: profile.tokensPerSecond,
      catalog,
    });
    modelSummary = {
      id: vram.modelId,
      label: vram.modelLabel,
      quantization: vram.quantization,
      totalVramGiB: vram.totalGiB,
      minGpuTier: vram.minGpuTier,
      tokensPerSecond: vram.tokensPerSecond,
    };
  }

  return {
    profile,
    providers: providers.sort((a, b) => a.totalMonthlyUsd - b.totalMonthlyUsd),
    warnings,
    model: modelSummary,
    totals: {
      gpuTier: profile.gpu,
      requestsPerMonth,
      computeSecondsPerMonth:
        requestsPerMonth * profile.avgSecondsPerRequest * profile.workers,
      tokensPerMonth: tpm,
      workers: profile.workers,
      usdPerMillionTokens: cheapest.usdPerMillionTokens,
    },
  };
}

export const MARKETPLACE_LABELS: Record<
  MarketplacePriceSheet['provider'],
  string
> = {
  runpod: 'RunPod',
  modal: 'Modal',
  replicate: 'Replicate',
  lambda: 'Lambda Labs',
  vast: 'Vast.ai',
};
