import { CronExpressionParser } from 'cron-parser';

const K8S_PREDEFINED: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export interface CronScheduleOptions {
  /** IANA timezone from CronJob spec.timeZone (default UTC). */
  timeZone?: string;
  /** Reference month for counting runs (default: current UTC month). */
  referenceDate?: Date;
}

/** Normalize Kubernetes cron (5-field) for cron-parser v5 (6-field with optional seconds). */
export function normalizeCronSchedule(schedule: string): string {
  const trimmed = schedule.trim();
  const predefined = K8S_PREDEFINED[trimmed.toLowerCase()];
  if (predefined) return `0 ${predefined}`;

  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) return `0 ${trimmed}`;
  return trimmed;
}

/**
 * Count how many times a cron schedule fires in the reference calendar month.
 * Used for CronJob monthly cost (runs × parallelism × pod resources).
 */
export function cronRunsPerMonth(
  schedule: string,
  options: CronScheduleOptions = {},
): number {
  const ref = options.referenceDate ?? new Date();
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

  try {
    const expr = CronExpressionParser.parse(normalizeCronSchedule(schedule), {
      currentDate: monthStart,
      tz: options.timeZone ?? 'UTC',
    });

    let count = 0;
    for (;;) {
      const next = expr.next();
      const at = next.toDate();
      if (at > monthEnd) break;
      count++;
      if (count > 50_000) break;
    }

    return count > 0 ? count : 1;
  } catch {
    // Legacy fallback when schedule is invalid or unsupported
    return 30;
  }
}
