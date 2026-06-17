import { parseManifests } from '../../../src/parser/index';
import { estimate, PROVIDER_LABELS } from '../../../src/estimator/index';
import type { EstimateResult, PriceSheet } from '../../../src/types';

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

export function runEstimate(yaml: string): EstimateResult {
  const parsed = parseManifests(yaml, awsSheet.defaults);
  return estimate(parsed, SHEETS, { gkeFreeTier: true, aksTier: 'free' });
}

export { PROVIDER_LABELS };
