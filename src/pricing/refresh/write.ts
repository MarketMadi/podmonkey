import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveRatesFromReference } from '../derive-rates';
import type { PriceSheet } from '../../types';

const PACKAGE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');

export function pricingRoot(): string {
  return join(PACKAGE_ROOT, 'pricing');
}

export function gpuPricingDir(): string {
  return join(pricingRoot(), 'gpu');
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function withDerivedRates(
  sheet: Omit<PriceSheet, 'rates'> & { rates?: PriceSheet['rates'] },
): PriceSheet {
  const derived = deriveRatesFromReference(sheet.reference_instance);
  return {
    ...sheet,
    rates: {
      cpu_per_vcpu_hour_usd: derived.cpu_per_vcpu_hour_usd,
      memory_per_gib_hour_usd: derived.memory_per_gib_hour_usd,
      derivation: `OpenCost Appendix A normalization from ${sheet.reference_instance.type} hourly`,
    },
  };
}
