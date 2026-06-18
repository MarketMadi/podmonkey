import type { EstimateOptions } from '../../../src/types';
import { parseManifests } from '../../../src/parser/index';
import { estimate, PROVIDER_LABELS } from '../../../src/estimator/index';
import type { EstimateResult, PriceSheet } from '../../../src/types';
import { formatEstimateMarkdown } from '../../../src/cli/format';

import awsSheet from '../../../pricing/aws-us-east-1.json';
import gcpSheet from '../../../pricing/gcp-us-central1.json';
import azureSheet from '../../../pricing/azure-eastus.json';
import hetznerSheet from '../../../pricing/hetzner-fsn1.json';

const SHEETS: PriceSheet[] = [
  awsSheet as PriceSheet,
  gcpSheet as PriceSheet,
  azureSheet as PriceSheet,
  hetznerSheet as PriceSheet,
];

export interface WebEstimateOptions {
  gkeFreeTier?: boolean;
  aksTier?: 'free' | 'standard';
  daemonsetNodeCount?: number;
  minNodes?: number;
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
  return estimate(parsed, SHEETS, options);
}

export function exportEstimateMarkdown(result: EstimateResult): string {
  return formatEstimateMarkdown(result);
}

export { PROVIDER_LABELS };
