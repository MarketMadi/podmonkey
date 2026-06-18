import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PriceSheet } from '../types';
import { deriveRatesFromReference, ratesNormalizeToReference } from './derive-rates';

const PACKAGE_ROOT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

/** Published list prices used in golden / benchmark tests (verify against sources). */
export const PRICING_BENCHMARKS = {
  aws: {
    eks_control_plane_monthly: 73,
    t4g_medium_monthly: 24.53,
    t3_medium_monthly: 30.37,
    m6i_large_monthly: 70.08,
    gp3_per_gib_month: 0.08,
    gp2_per_gib_month: 0.1,
    alb_monthly_base: 18,
  },
  gcp: {
    e2_medium_monthly: 24.82,
    pd_ssd_per_gib_month: 0.17,
  },
  azure: {
    b2s_monthly: 30.66,
    managed_premium_per_gib_month: 0.15,
  },
  hetzner: {
    cx22_monthly: 5.62,
    volume_per_gib_month: 0.052,
  },
} as const;

export function loadAllPriceSheets(dir = join(PACKAGE_ROOT, 'pricing')): PriceSheet[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as PriceSheet);
}

export function assertSheetsValid(sheets: PriceSheet[]): string[] {
  const errors: string[] = [];

  for (const sheet of sheets) {
    if (!ratesNormalizeToReference(sheet)) {
      errors.push(`${sheet.provider}: rates do not normalize to reference_instance`);
    }

    const catalog = sheet.instance_catalog ?? [sheet.reference_instance];
    if (catalog.length < 2) {
      errors.push(`${sheet.provider}: instance_catalog should list multiple VM SKUs`);
    }

    const storageKeys = Object.keys(sheet.storage).filter((k) =>
      k.endsWith('_per_gib_month_usd'),
    );
    if (storageKeys.length < 2 && sheet.provider !== 'hetzner') {
      errors.push(`${sheet.provider}: storage should define multiple volume tiers`);
    }

    const derived = deriveRatesFromReference(sheet.reference_instance);
    const h = sheet.hours_per_month;
    const refMonthly =
      sheet.reference_instance.hourly_usd * h;
    const catalogMatch = catalog.some(
      (i) => Math.abs(i.hourly_usd * h - refMonthly) < 0.02 ||
        sheet.reference_instance.type === i.type,
    );
    if (!catalogMatch) {
      errors.push(`${sheet.provider}: reference_instance missing from catalog`);
    }
  }

  return errors;
}
