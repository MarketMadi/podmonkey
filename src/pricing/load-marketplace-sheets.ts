import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketplacePriceSheet, MarketplaceProviderId } from '../types';

const PACKAGE_ROOT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

const MARKETPLACE_FILES: Record<MarketplaceProviderId, string> = {
  runpod: 'runpod.json',
  modal: 'modal.json',
  replicate: 'replicate.json',
  lambda: 'lambda.json',
  vast: 'vast.json',
};

export function marketplacePricingDir(customDir?: string): string {
  return customDir ?? join(PACKAGE_ROOT, 'pricing', 'marketplace');
}

export function loadMarketplacePriceSheet(
  provider: MarketplaceProviderId,
  dir?: string,
): MarketplacePriceSheet {
  const path = join(marketplacePricingDir(dir), MARKETPLACE_FILES[provider]);
  return JSON.parse(readFileSync(path, 'utf8')) as MarketplacePriceSheet;
}

export function loadAllMarketplacePriceSheets(
  dir?: string,
): MarketplacePriceSheet[] {
  const base = marketplacePricingDir(dir);
  return readdirSync(base)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(base, f), 'utf8')) as MarketplacePriceSheet);
}

export function listMarketplaceProviders(dir?: string): MarketplaceProviderId[] {
  const base = marketplacePricingDir(dir);
  const files = new Set(readdirSync(base));
  return (Object.keys(MARKETPLACE_FILES) as MarketplaceProviderId[]).filter(
    (p) => files.has(MARKETPLACE_FILES[p]),
  );
}
