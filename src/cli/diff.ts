import type {
  EstimateResult,
  MonthlyUsdRange,
  ProviderId,
} from '../types';

export interface ProviderDiff {
  provider: ProviderId;
  region: string;
  before: MonthlyUsdRange;
  after: MonthlyUsdRange;
  deltaMin: number;
  deltaMax: number;
}

export interface EstimateDiff {
  base: EstimateResult;
  current: EstimateResult;
  byProvider: ProviderDiff[];
  /** Largest max-total increase across providers (conservative). */
  maxIncreaseUsd: number;
  /** Largest max-total decrease across providers. */
  maxDecreaseUsd: number;
}

export function computeEstimateDiff(
  base: EstimateResult,
  current: EstimateResult,
): EstimateDiff {
  const baseByProvider = new Map(
    base.providers.map((p) => [p.provider, p] as const),
  );

  const byProvider: ProviderDiff[] = [];

  for (const afterProv of current.providers) {
    const beforeProv = baseByProvider.get(afterProv.provider);
    if (!beforeProv) continue;

    const before = beforeProv.totalMonthlyUsdRange;
    const after = afterProv.totalMonthlyUsdRange;

    byProvider.push({
      provider: afterProv.provider,
      region: afterProv.region,
      before,
      after,
      deltaMin: roundDelta(after.min - before.min),
      deltaMax: roundDelta(after.max - before.max),
    });
  }

  const increases = byProvider.map((d) => d.deltaMax);
  const decreases = byProvider.map((d) => -d.deltaMin);

  return {
    base,
    current,
    byProvider,
    maxIncreaseUsd: increases.length ? Math.max(...increases, 0) : 0,
    maxDecreaseUsd: decreases.length ? Math.max(...decreases, 0) : 0,
  };
}

function roundDelta(n: number): number {
  return Math.round(n * 100) / 100;
}
