import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiPriceSheet } from '../types';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function apiPricingDir(): string {
  return join(PACKAGE_ROOT, 'pricing/api');
}

export function loadAllApiPriceSheets(): ApiPriceSheet[] {
  const dir = apiPricingDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = readFileSync(join(dir, f), 'utf8');
      return JSON.parse(raw) as ApiPriceSheet;
    });
}
