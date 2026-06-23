import type {
  ApiPriceSheet,
  EstimateOptions,
  EstimateResult,
  GpuPriceSheet,
  InferenceEstimateResult,
  MarketplacePriceSheet,
  PriceSheet,
} from '../../../src/types';
import { formatEstimateMarkdown } from '../../../src/cli/format';
import { parseManifests } from '../../../src/parser/index';
import {
  isInferenceProfileYaml,
  parseInferenceProfile,
} from '../../../src/parser/inference-profile';
import { estimate, PROVIDER_LABELS } from '../../../src/estimator/index';
import groqSheet from '../../../pricing/api/groq.json';
import openaiSheet from '../../../pricing/api/openai.json';
import togetherSheet from '../../../pricing/api/together.json';
import {
  estimateInference,
  MARKETPLACE_LABELS,
  API_PROVIDER_LABELS,
} from '../../../src/estimator/inference';

import awsSheet from '../../../pricing/aws-us-east-1.json';
import gcpSheet from '../../../pricing/gcp-us-central1.json';
import azureSheet from '../../../pricing/azure-eastus.json';
import hetznerSheet from '../../../pricing/hetzner-fsn1.json';
import awsGpuSheet from '../../../pricing/gpu/aws-us-east-1.json';
import azureGpuSheet from '../../../pricing/gpu/azure-eastus.json';
import runpodSheet from '../../../pricing/marketplace/runpod.json';
import modalSheet from '../../../pricing/marketplace/modal.json';
import replicateSheet from '../../../pricing/marketplace/replicate.json';
import lambdaSheet from '../../../pricing/marketplace/lambda.json';
import vastSheet from '../../../pricing/marketplace/vast.json';
import modelCatalog from '../../../catalog/models.json';
import type { ModelCatalog } from '../../../src/catalog/types';
import { setDefaultModelCatalog } from '../../../src/catalog/resolve';

const SHEETS: PriceSheet[] = [
  awsSheet as PriceSheet,
  gcpSheet as PriceSheet,
  azureSheet as PriceSheet,
  hetznerSheet as PriceSheet,
];

const GPU_SHEETS: GpuPriceSheet[] = [
  awsGpuSheet as GpuPriceSheet,
  azureGpuSheet as GpuPriceSheet,
];

const MARKETPLACE_SHEETS: MarketplacePriceSheet[] = [
  runpodSheet as MarketplacePriceSheet,
  modalSheet as MarketplacePriceSheet,
  replicateSheet as MarketplacePriceSheet,
  lambdaSheet as MarketplacePriceSheet,
  vastSheet as MarketplacePriceSheet,
];

export type InputMode = 'kubernetes' | 'inference';

export interface WebEstimateOptions {
  gkeFreeTier?: boolean;
  aksTier?: 'free' | 'standard';
  daemonsetNodeCount?: number;
  minNodes?: number;
}

export function detectInputMode(yaml: string): InputMode {
  return isInferenceProfileYaml(yaml) ? 'inference' : 'kubernetes';
}

export function runEstimate(
  yaml: string,
  webOptions: WebEstimateOptions = {},
): EstimateResult {
  const defaults = {
    ...awsSheet.defaults,
    ...(webOptions.daemonsetNodeCount !== undefined && {
      daemonset_node_count: webOptions.daemonsetNodeCount,
    }),
  };

  const options: EstimateOptions = {
    gkeFreeTier: webOptions.gkeFreeTier ?? true,
    aksTier: webOptions.aksTier ?? 'free',
    minNodes: webOptions.minNodes ?? 1,
    daemonsetNodeCount: webOptions.daemonsetNodeCount,
  };

  const parsed = parseManifests(yaml, defaults);
  return estimate(parsed, SHEETS, options, GPU_SHEETS);
}

const CATALOG = modelCatalog as ModelCatalog;
setDefaultModelCatalog(CATALOG);

const API_SHEETS: ApiPriceSheet[] = [
  groqSheet as ApiPriceSheet,
  openaiSheet as ApiPriceSheet,
  togetherSheet as ApiPriceSheet,
];

export function runInferenceEstimate(yaml: string): InferenceEstimateResult {
  const profile = parseInferenceProfile(yaml, CATALOG);
  return estimateInference(profile, MARKETPLACE_SHEETS, CATALOG, API_SHEETS);
}

export function exportEstimateMarkdown(result: EstimateResult): string {
  return formatEstimateMarkdown(result);
}

export function exportInferenceMarkdown(
  result: InferenceEstimateResult,
): string {
  const v = result.verdict;
  const lines = [
    '## AI startup cost estimate (week 1)',
    '',
    `**${v.headline}**`,
    v.detail,
    `Planning range: $${v.planningMinUsd}–$${v.planningMaxUsd}/mo (±40%)`,
    '',
    `**Profile:** ${result.profile.name}`,
    result.model ? `**Model:** ${result.model.label}` : null,
    `**Requests/day:** ${result.profile.requestsPerDay.toLocaleString()}`,
    result.profile.inputTokensPerRequest != null
      ? `**Tokens/request:** ${result.profile.inputTokensPerRequest} in / ${result.profile.outputTokensPerRequest} out`
      : null,
    '',
    '### Managed APIs',
    '| Provider | $/month | $/1M tokens |',
    '|----------|---------|-------------|',
    ...result.apiProviders.map(
      (p) =>
        `| ${API_PROVIDER_LABELS[p.provider]} (${p.label}) | $${p.totalMonthlyUsd.toFixed(0)} | $${p.usdPerMillionTokens.toFixed(2)} |`,
    ),
    '',
    '### GPU rental',
    '| Provider | $/month | $/1M tokens |',
    '|----------|---------|-------------|',
    ...result.providers.map(
      (p) =>
        `| ${MARKETPLACE_LABELS[p.provider]} | $${p.totalMonthlyUsd.toFixed(0)} | ${p.usdPerMillionTokens != null ? `$${p.usdPerMillionTokens.toFixed(2)}` : '—'} |`,
    ),
  ].filter((line): line is string => line != null);
  return lines.join('\n');
}

export { PROVIDER_LABELS, MARKETPLACE_LABELS, API_PROVIDER_LABELS };
