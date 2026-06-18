import { describe, expect, it } from 'vitest';
import { cronRunsPerMonth, normalizeCronSchedule } from './cron-schedule';

describe('normalizeCronSchedule', () => {
  it('expands K8s @daily', () => {
    expect(normalizeCronSchedule('@daily')).toBe('0 0 0 * * *');
  });

  it('prefixes 5-field cron with seconds', () => {
    expect(normalizeCronSchedule('0 2 * * *')).toBe('0 0 2 * * *');
  });
});

describe('cronRunsPerMonth', () => {
  it('counts daily 2am runs in June 2026', () => {
    const runs = cronRunsPerMonth('0 2 * * *', {
      referenceDate: new Date('2026-06-15T12:00:00Z'),
    });
    expect(runs).toBe(30);
  });

  it('counts monthly schedule once', () => {
    const runs = cronRunsPerMonth('@monthly', {
      referenceDate: new Date('2026-06-15T12:00:00Z'),
    });
    expect(runs).toBe(1);
  });

  it('counts hourly runs in a 30-day month', () => {
    const runs = cronRunsPerMonth('@hourly', {
      referenceDate: new Date('2026-06-15T12:00:00Z'),
    });
    expect(runs).toBeGreaterThan(700);
  });
});
