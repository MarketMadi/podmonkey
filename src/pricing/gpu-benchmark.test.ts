import { describe, expect, it } from 'vitest';
import { loadAllGpuPriceSheets } from './load-gpu-sheets';
import {
  assertGpuSheetsValid,
  assertPricingFresh,
  MAX_PRICING_AGE_DAYS,
} from './validate-gpu-sheets';
import { loadAllPriceSheets } from './validate-sheets';

const gpuSheets = loadAllGpuPriceSheets();
const cpuSheets = loadAllPriceSheets();

/** Providers refreshed from public APIs in every CI run (no secrets). */
const API_REFRESHED_PROVIDERS = ['aws', 'azure'] as const;

describe('GPU price sheet validation', () => {
  it('all GPU sheets pass structural validation', () => {
    expect(assertGpuSheetsValid(gpuSheets)).toEqual([]);
  });

  it('every GPU instance has a documented source', () => {
    for (const sheet of gpuSheets) {
      for (const inst of sheet.instances) {
        expect(inst.source.length).toBeGreaterThan(10);
        expect(inst.hourly_usd).toBeGreaterThan(0);
      }
    }
  });

  it('GPU sheets are fresh (within cron window)', () => {
    const stale: string[] = [];
    for (const sheet of gpuSheets) {
      const err = assertPricingFresh(sheet.as_of, `gpu/${sheet.provider}`);
      if (err) stale.push(err);
    }
    expect(
      stale,
      `Run npm run refresh-pricing — sheets older than ${MAX_PRICING_AGE_DAYS} days:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('includes AWS and Azure GPU sheets (API-refreshed)', () => {
    const present = new Set(gpuSheets.map((s) => s.provider));
    const missing = API_REFRESHED_PROVIDERS.filter((p) => !present.has(p));
    expect(missing).toEqual([]);
  });
});

describe('CPU price sheet API provenance', () => {
  it('AWS and Azure CPU sheets were fetched from live APIs', () => {
    const missing = cpuSheets
      .filter(
        (s) =>
          (API_REFRESHED_PROVIDERS as readonly string[]).includes(s.provider) &&
          !s.fetched_at,
      )
      .map((s) => s.provider);
    expect(missing, 'Run npm run refresh-pricing').toEqual([]);
  });

  it('API-refreshed CPU sheets are fresh (within cron window)', () => {
    const stale: string[] = [];
    for (const sheet of cpuSheets) {
      if (!sheet.fetched_at) continue;
      const err = assertPricingFresh(sheet.as_of, sheet.provider);
      if (err) stale.push(err);
    }
    expect(
      stale,
      `Run npm run refresh-pricing — sheets older than ${MAX_PRICING_AGE_DAYS} days:\n${stale.join('\n')}`,
    ).toEqual([]);
  });
});

describe('AWS GPU catalog spot checks', () => {
  const aws = gpuSheets.find((s) => s.provider === 'aws');
  it('includes g4dn.xlarge and g5.xlarge', () => {
    expect(aws).toBeDefined();
    const types = aws!.instances.map((i) => i.type);
    expect(types).toContain('g4dn.xlarge');
    expect(types).toContain('g5.xlarge');
  });

  it('g4dn.xlarge is in a plausible on-demand range ($0.40–$0.80/hr)', () => {
    const g4dn = aws!.instances.find((i) => i.type === 'g4dn.xlarge')!;
    expect(g4dn.hourly_usd).toBeGreaterThan(0.4);
    expect(g4dn.hourly_usd).toBeLessThan(0.8);
  });
});
