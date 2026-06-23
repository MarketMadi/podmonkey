import type { GpuPriceSheet } from '../types';

/** Maximum age before CI freshness check fails (cron runs every 3 days). */
export const MAX_PRICING_AGE_DAYS = 4;

export function daysSince(isoDate: string, now = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00Z`);
  const ms = now.getTime() - then.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

export function assertGpuSheetsValid(sheets: GpuPriceSheet[]): string[] {
  const errors: string[] = [];

  for (const sheet of sheets) {
    if (!sheet.as_of || !/^\d{4}-\d{2}-\d{2}$/.test(sheet.as_of)) {
      errors.push(`${sheet.provider}: invalid as_of date`);
    }

    if (!sheet.fetched_at) {
      errors.push(`${sheet.provider}: missing fetched_at`);
    }

    if (!Array.isArray(sheet.sources) || sheet.sources.length === 0) {
      errors.push(`${sheet.provider}: sources must list API endpoints`);
    }

    if (!sheet.instances?.length) {
      errors.push(`${sheet.provider}: instances must not be empty`);
    }

    for (const inst of sheet.instances ?? []) {
      if (!inst.hourly_usd || inst.hourly_usd <= 0) {
        errors.push(`${sheet.provider}/${inst.type}: hourly_usd must be > 0`);
      }
      if (!inst.source) {
        errors.push(`${sheet.provider}/${inst.type}: missing price source`);
      }
      if (inst.gpu_count < 1) {
        errors.push(`${sheet.provider}/${inst.type}: gpu_count must be >= 1`);
      }
      const expectedMonthly =
        Math.round(inst.hourly_usd * sheet.hours_per_month * 100) / 100;
      if (Math.abs(inst.monthly_usd - expectedMonthly) > 0.02) {
        errors.push(
          `${sheet.provider}/${inst.type}: monthly_usd ${inst.monthly_usd} != hourly × ${sheet.hours_per_month}`,
        );
      }
    }
  }

  return errors;
}

export function assertPricingFresh(
  asOf: string,
  label: string,
  maxAgeDays = MAX_PRICING_AGE_DAYS,
  now = new Date(),
): string | null {
  const age = daysSince(asOf, now);
  if (age > maxAgeDays) {
    return `${label}: as_of ${asOf} is ${age.toFixed(1)} days old (max ${maxAgeDays})`;
  }
  return null;
}
