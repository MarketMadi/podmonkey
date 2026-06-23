import type {
  ApiPriceSheet,
  ApiProviderEstimate,
  InferenceProfile,
} from '../types';
import { roundUsd } from '../units';

const DAYS_PER_MONTH = 30;
const PLANNING_MARGIN = 0.4;

export const API_PROVIDER_LABELS: Record<ApiPriceSheet['provider'], string> = {
  groq: 'Groq',
  openai: 'OpenAI',
  together: 'Together AI',
};

export function tokensPerRequest(profile: InferenceProfile): number {
  if (
    profile.inputTokensPerRequest != null &&
    profile.outputTokensPerRequest != null
  ) {
    return profile.inputTokensPerRequest + profile.outputTokensPerRequest;
  }
  return 0;
}

export function monthlyTokenVolume(profile: InferenceProfile): number {
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
  return 0;
}

export function estimateApiProvider(
  profile: InferenceProfile,
  sheet: ApiPriceSheet,
): ApiProviderEstimate | null {
  if (!profile.model) return null;

  const pricing = sheet.models.find((m) => m.catalog_id === profile.model);
  if (!pricing) return null;

  if (
    profile.inputTokensPerRequest == null ||
    profile.outputTokensPerRequest == null
  ) {
    return null;
  }

  const requestsPerMonth = profile.requestsPerDay * DAYS_PER_MONTH;
  const inputTokens = profile.inputTokensPerRequest * requestsPerMonth;
  const outputTokens = profile.outputTokensPerRequest * requestsPerMonth;

  const monthlyUsd = roundUsd(
    (inputTokens / 1_000_000) * pricing.input_per_million_usd +
      (outputTokens / 1_000_000) * pricing.output_per_million_usd,
  );

  const totalTokens = inputTokens + outputTokens;
  const usdPerMillionTokens =
    totalTokens > 0 ? roundUsd((monthlyUsd / totalTokens) * 1_000_000) : 0;

  return {
    provider: sheet.provider,
    label: pricing.label,
    apiModel: pricing.api_model,
    asOf: sheet.as_of,
    totalMonthlyUsd: monthlyUsd,
    usdPerMillionTokens,
    inputPerMillionUsd: pricing.input_per_million_usd,
    outputPerMillionUsd: pricing.output_per_million_usd,
  };
}

export function estimateApiProviders(
  profile: InferenceProfile,
  sheets: ApiPriceSheet[],
): ApiProviderEstimate[] {
  const estimates: ApiProviderEstimate[] = [];
  for (const sheet of sheets) {
    const est = estimateApiProvider(profile, sheet);
    if (est) estimates.push(est);
  }
  return estimates.sort((a, b) => a.totalMonthlyUsd - b.totalMonthlyUsd);
}

export function planningRange(usd: number): {
  min: number;
  max: number;
} {
  return {
    min: roundUsd(usd * (1 - PLANNING_MARGIN)),
    max: roundUsd(usd * (1 + PLANNING_MARGIN)),
  };
}

export { PLANNING_MARGIN };
