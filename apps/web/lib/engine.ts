import type {
  EstimateOptions,
  EstimateResult,
  GpuPriceSheet,
  InferenceEstimateResult,
  PriceSheet,
} from '../../../src/types';
import { parseManifests } from '../../../src/parser/index';
import {
  isInferenceProfileYaml,
  parseInferenceProfile,
} from '../../../src/parser/inference-profile';
import { estimate, PROVIDER_LABELS } from '../../../src/estimator/index';
import {
  estimateInference,
  MARKETPLACE_LABELS,
} from '../../../src/estimator/inference';
import { formatEstimateMarkdown } from '../../../src/cli/format';
import type { MarketplacePriceSheet } from '../../../src/types';

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

export function runInferenceEstimate(yaml: string): InferenceEstimateResult {
  const profile = parseInferenceProfile(yaml, CATALOG);
  return estimateInference(profile, MARKETPLACE_SHEETS, CATALOG);
}

export function exportEstimateMarkdown(result: EstimateResult): string {
  return formatEstimateMarkdown(result);
}

export function exportInferenceMarkdown(
  result: InferenceEstimateResult,
): string {
  const lines = [
    '## Inference cost estimate (planning)',
    '',
    `**Profile:** ${result.profile.name}`,
    result.model
      ? `**Model:** ${result.model.label} (${result.model.quantization}, ~${result.model.totalVramGiB.toFixed(1)} GiB VRAM)`
      : null,
    `**GPU tier:** ${result.profile.gpu}`,
    `**Billing:** ${result.profile.billing}`,
    `**Requests/day:** ${result.profile.requestsPerDay.toLocaleString()}`,
    `**Avg seconds/request:** ${result.profile.avgSecondsPerRequest}`,
    `**Workers:** ${result.profile.workers}`,
    result.totals.usdPerMillionTokens != null
      ? `**$/1M tokens (cheapest):** $${result.totals.usdPerMillionTokens.toFixed(2)}`
      : null,
    '',
    '| Provider | $/month | $/1M tokens | Pod break-even req/day |',
    '|----------|---------|-------------|------------------------|',
    ...result.providers.map(
      (p) =>
        `| ${MARKETPLACE_LABELS[p.provider]} | $${p.totalMonthlyUsd.toFixed(0)} | ${p.usdPerMillionTokens != null ? `$${p.usdPerMillionTokens.toFixed(2)}` : '—'} | ${p.podBreakEvenRequestsPerDay?.toLocaleString() ?? '—'} |`,
    ),
  ].filter((line): line is string => line != null);
  return lines.join('\n');
}

export { PROVIDER_LABELS, MARKETPLACE_LABELS };
