import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PriceSheet, ProviderId } from '../types';

const PACKAGE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const DEFAULT_SHEETS: ProviderId[] = ['aws', 'gcp', 'azure', 'hetzner'];

const SHEET_FILES: Record<ProviderId, string> = {
  aws: 'aws-us-east-1.json',
  gcp: 'gcp-us-central1.json',
  azure: 'azure-eastus.json',
  hetzner: 'hetzner-fsn1.json',
};

export function pricingDir(customDir?: string): string {
  return customDir ?? join(PACKAGE_ROOT, 'pricing');
}

export function loadPriceSheet(
  provider: ProviderId,
  dir?: string,
): PriceSheet {
  const path = join(pricingDir(dir), SHEET_FILES[provider]);
  return JSON.parse(readFileSync(path, 'utf8')) as PriceSheet;
}

export function loadPriceSheets(
  providers: ProviderId[] = DEFAULT_SHEETS,
  dir?: string,
): PriceSheet[] {
  return providers.map((p) => loadPriceSheet(p, dir));
}

export function listAvailableSheets(dir?: string): ProviderId[] {
  const base = pricingDir(dir);
  const files = new Set(readdirSync(base));
  return DEFAULT_SHEETS.filter((p) => files.has(SHEET_FILES[p]));
}
