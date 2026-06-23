import {
  API_PROVIDER_LABELS,
  estimateApiProviders,
  planningRange,
} from './api-inference';
import {
  gpuPodUtilizationPercent,
  gpuSecondsPerRequest,
} from './gpu-time';
import { computeModelVram } from '../catalog/resolve';
import { collectModelVramWarnings } from '../catalog/warnings';
import type {
  ApiPriceSheet,
  FounderVerdict,
  GpuPriceSheet,
  InferenceBillingMode,
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
  if (
    profile.inputTokensPerRequest != null &&
    profile.outputTokensPerRequest != null
  ) {
    return (
      (profile.inputTokensPerRequest + profile.outputTokensPerRequest) *
      profile.requestsPerDay *
      DAYS_PER_MONTH
    );
  }

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

const API_PLANNING_MARGIN = 0.1;
const GPU_PLANNING_MARGIN = 0.25;

function estimateMarketplaceProvider(
  profile: InferenceProfile,
  sheet: MarketplacePriceSheet,
  catalog?: import('../catalog/types').ModelCatalog,
): MarketplaceProviderEstimate {
  const tier = tierForSheet(sheet, profile.gpu);
  const requestsPerMonth = profile.requestsPerDay * DAYS_PER_MONTH;

  const secServerless = gpuSecondsPerRequest(
    profile,
    catalog,
    'serverless',
  );
  const secPod = gpuSecondsPerRequest(profile, catalog, 'pod');

  let serverlessMonthlyUsd: number | null = null;
  if (tier.serverless_per_second_usd != null) {
    serverlessMonthlyUsd = roundUsd(
      requestsPerMonth *
        secServerless *
        profile.workers *
        tier.serverless_per_second_usd,
    );
  }

  let podMonthlyUsd: number | null = null;
  let podUtilizationPercent: number | null = null;
  if (tier.pod_per_hour_usd != null) {
    podMonthlyUsd = roundUsd(
      tier.pod_per_hour_usd * sheet.hours_per_month * profile.workers,
    );
    podUtilizationPercent =
      Math.round(
        gpuPodUtilizationPercent(
          requestsPerMonth * secPod * profile.workers,
          profile.workers,
          sheet.hours_per_month,
        ) * 10,
      ) / 10;
  }

  let billing: InferenceBillingMode;
  let monthlyUsd: number;
  let label: string;
  let secondsPerRequest: number;

  const pickAuto = (): void => {
    if (serverlessMonthlyUsd != null && podMonthlyUsd != null) {
      if (serverlessMonthlyUsd <= podMonthlyUsd) {
        billing = 'serverless';
        monthlyUsd = serverlessMonthlyUsd;
        secondsPerRequest = secServerless;
        label = `Serverless GPU (${tier.label})`;
      } else {
        billing = 'pod';
        monthlyUsd = podMonthlyUsd;
        secondsPerRequest = secPod;
        label = `Always-on pod (${tier.label}, ×${profile.workers})`;
      }
      return;
    }
    if (serverlessMonthlyUsd != null) {
      billing = 'serverless';
      monthlyUsd = serverlessMonthlyUsd;
      secondsPerRequest = secServerless;
      label = `Serverless GPU (${tier.label})`;
      return;
    }
    if (podMonthlyUsd != null) {
      billing = 'pod';
      monthlyUsd = podMonthlyUsd;
      secondsPerRequest = secPod;
      label = `Always-on pod (${tier.label}, ×${profile.workers})`;
      return;
    }
    throw new Error(
      `${sheet.provider} has no serverless or pod pricing for ${tier.id}`,
    );
  };

  if (profile.billing === 'auto') {
    pickAuto();
  } else if (profile.billing === 'serverless') {
    if (serverlessMonthlyUsd == null) {
      throw new Error(
        `${sheet.provider} does not publish serverless pricing for ${tier.id}`,
      );
    }
    billing = 'serverless';
    monthlyUsd = serverlessMonthlyUsd;
    secondsPerRequest = secServerless;
    label = `Serverless GPU (${tier.label})`;
  } else {
    if (podMonthlyUsd == null) {
      throw new Error(
        `${sheet.provider} does not publish pod/VM pricing for ${tier.id}`,
      );
    }
    billing = 'pod';
    monthlyUsd = podMonthlyUsd;
    secondsPerRequest = secPod;
    label = `Always-on pod (${tier.label}, ×${profile.workers})`;
  }

  const profileForBreakEven = {
    ...profile,
    avgSecondsPerRequest: secServerless,
  };

  return {
    provider: sheet.provider,
    asOf: sheet.as_of,
    totalMonthlyUsd: monthlyUsd!,
    matchedTier: tier.label,
    billing: billing!,
    secondsPerRequest: secondsPerRequest!,
    serverlessMonthlyUsd,
    podMonthlyUsd,
    podUtilizationPercent,
    usdPerMillionTokens: usdPerMillionTokens(monthlyUsd!, profile, catalog),
    podBreakEvenRequestsPerDay: podBreakEvenRequestsPerDay(
      tier,
      profileForBreakEven,
      sheet.hours_per_month,
    ),
    lineItems: [
      {
        category: 'gpu',
        label: label!,
        monthlyUsd: monthlyUsd!,
      },
    ],
  };
}

function buildFounderVerdict(
  apiProviders: InferenceEstimateResult['apiProviders'],
  gpuProviders: MarketplaceProviderEstimate[],
): FounderVerdict {
  const comparableApis = apiProviders.filter((p) => p.provider !== 'openai');
  const cheapestApi = comparableApis[0];
  const cheapestGpu = gpuProviders[0];

  if (
    cheapestApi &&
    (!cheapestGpu ||
      cheapestApi.totalMonthlyUsd <= cheapestGpu.totalMonthlyUsd)
  ) {
    const range = planningRange(cheapestApi.totalMonthlyUsd, API_PLANNING_MARGIN);
    return {
      kind: 'api',
      providerLabel: `${API_PROVIDER_LABELS[cheapestApi.provider]} (${cheapestApi.label})`,
      monthlyUsd: cheapestApi.totalMonthlyUsd,
      headline: `Start with an API — about ${formatUsd(cheapestApi.totalMonthlyUsd)}/mo at your volume`,
      detail:
        'Week 1 recommendation: use a hosted API and ship. Revisit GPU rental when you have steady traffic and a reason to self-host (privacy, fine-tuning, cost at scale).',
      planningMinUsd: range.min,
      planningMaxUsd: range.max,
    };
  }

  const gpu = cheapestGpu!;
  const range = planningRange(gpu.totalMonthlyUsd, GPU_PLANNING_MARGIN);
  return {
    kind: 'gpu',
    providerLabel: `${MARKETPLACE_LABELS[gpu.provider]} (${gpu.matchedTier})`,
    monthlyUsd: gpu.totalMonthlyUsd,
    headline: `GPU rental may win at your volume — about ${formatUsd(gpu.totalMonthlyUsd)}/mo`,
    detail:
      'Still expect setup time (vLLM, monitoring, on-call). APIs are usually faster to ship in week 1 even if GPU looks cheaper on paper.',
    planningMinUsd: range.min,
    planningMaxUsd: range.max,
  };
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function collectInferenceWarnings(
  profile: InferenceProfile,
  catalog?: import('../catalog/types').ModelCatalog,
): Warning[] {
  const warnings: Warning[] = [];

  warnings.push({
    id: 'FOUNDER_PLANNING',
    severity: 'info',
    message:
      'Week-1 planning estimate. APIs typically ±10%; GPU rental ±25%. Excludes eng time, egress, and storage.',
  });

  if (profile.model) {
    const vram = computeModelVram({
      modelId: profile.model,
      quantization: profile.quantization,
      contextLength: profile.contextLength,
      concurrentUsers: profile.concurrentUsers,
      tokensPerSecond: profile.tokensPerSecond,
      catalog,
    });
    if (vram.exceedsSingleGpu) {
      warnings.push(
        ...collectModelVramWarnings(vram, profile.gpu).filter(
          (w) => w.id === 'MODEL_EXCEEDS_VRAM',
        ),
      );
    }
  }

  if (
    profile.inputTokensPerRequest == null ||
    profile.outputTokensPerRequest == null
  ) {
    warnings.push({
      id: 'USE_TOKEN_INPUTS',
      severity: 'info',
      message:
        'Add inputTokensPerRequest and outputTokensPerRequest for clearer week-1 math (e.g. 800 in / 250 out).',
    });
  }

  if (profile.billing === 'serverless' && profile.requestsPerDay > 50_000) {
    warnings.push({
      id: 'HIGH_TRAFFIC',
      severity: 'info',
      message:
        'High volume — compare always-on GPU pods; serverless cold starts add cost not modeled here.',
    });
  }

  return warnings;
}

export function estimateInference(
  profile: InferenceProfile,
  sheets: MarketplacePriceSheet[],
  catalog?: import('../catalog/types').ModelCatalog,
  apiSheets: ApiPriceSheet[] = [],
): InferenceEstimateResult {
  const apiProviders = estimateApiProviders(profile, apiSheets);

  const providers: MarketplaceProviderEstimate[] = [];
  const errors: string[] = [];

  for (const sheet of sheets) {
    try {
      providers.push(estimateMarketplaceProvider(profile, sheet, catalog));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (providers.length === 0 && apiProviders.length === 0) {
    throw new Error(
      `No estimates for ${profile.gpu}:\n${errors.join('\n')}`,
    );
  }

  const warnings = collectInferenceWarnings(profile, catalog);
  const sortedGpu = providers.sort((a, b) => a.totalMonthlyUsd - b.totalMonthlyUsd);

  if (sortedGpu.length > 0) {
    const lowUtil = sortedGpu.find(
      (p) =>
        p.podUtilizationPercent != null &&
        p.podUtilizationPercent < 30 &&
        p.serverlessMonthlyUsd != null &&
        p.podMonthlyUsd != null &&
        p.podMonthlyUsd > p.serverlessMonthlyUsd,
    );
    if (lowUtil) {
      warnings.push({
        id: 'POD_UNDERUTILIZED',
        severity: 'info',
        message: `Always-on pods would run at ~${lowUtil.podUtilizationPercent}% GPU utilization — serverless (~${formatUsd(lowUtil.serverlessMonthlyUsd!)}/mo) beats pod (~${formatUsd(lowUtil.podMonthlyUsd!)}/mo) at this volume.`,
      });
    }

    const withBreakEven = sortedGpu.filter(
      (p) => p.podBreakEvenRequestsPerDay != null,
    );
    if (withBreakEven.length > 0) {
      const ref = withBreakEven[0];
      const breakEven = ref.podBreakEvenRequestsPerDay!;
      if (profile.requestsPerDay >= breakEven) {
        warnings.push({
          id: 'POD_CHEAPER',
          severity: 'info',
          message: `Above ~${breakEven.toLocaleString()} req/day, an always-on GPU pod on ${MARKETPLACE_LABELS[ref.provider]} may beat serverless.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    warnings.push({
      id: 'PARTIAL_GPU_PROVIDERS',
      severity: 'info',
      message: `Some GPU hosts omitted: ${errors.join('; ')}`,
    });
  }

  const requestsPerMonth = profile.requestsPerDay * DAYS_PER_MONTH;
  const secForTotals = gpuSecondsPerRequest(profile, catalog, 'serverless');
  const tpm = tokensPerMonth(profile, catalog);

  const allOptions = [
    ...apiProviders.map((a) => ({
      usd: a.totalMonthlyUsd,
      perM: a.usdPerMillionTokens,
    })),
    ...sortedGpu.map((g) => ({
      usd: g.totalMonthlyUsd,
      perM: g.usdPerMillionTokens,
    })),
  ];
  const cheapestOverall = allOptions.sort((a, b) => a.usd - b.usd)[0];

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

  const verdict = buildFounderVerdict(apiProviders, sortedGpu);

  return {
    profile,
    apiProviders,
    providers: sortedGpu,
    verdict,
    warnings,
    model: modelSummary,
    totals: {
      gpuTier: profile.gpu,
      requestsPerMonth,
      computeSecondsPerMonth:
        requestsPerMonth * secForTotals * profile.workers,
      tokensPerMonth: tpm,
      workers: profile.workers,
      usdPerMillionTokens: cheapestOverall?.perM ?? null,
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

export { API_PROVIDER_LABELS };
