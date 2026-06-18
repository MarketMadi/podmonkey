import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveRatesFromReference,
  ratesNormalizeToReference,
} from './derive-rates';
import { cheapestNodeFloor } from './instance-catalog';
import { computeNodeFloorMonthly } from './node-floor';
import type { PriceSheet } from '../types';

const pricingDir = join(import.meta.dirname, '../../pricing');
const sheets = readdirSync(pricingDir)
  .filter((f) => f.endsWith('.json'))
  .map(
    (f) =>
      JSON.parse(readFileSync(join(pricingDir, f), 'utf8')) as PriceSheet,
  );

describe('deriveRatesFromReference', () => {
  it('normalizes AWS m6i.large to hourly price', () => {
    const rates = deriveRatesFromReference({
      type: 'm6i.large',
      vcpu: 2,
      memory_gib: 8,
      hourly_usd: 0.096,
    });
    const sum = 2 * rates.cpu_per_vcpu_hour_usd + 8 * rates.memory_per_gib_hour_usd;
    expect(sum).toBeCloseTo(0.096, 4);
    expect(rates.cpu_per_vcpu_hour_usd).toBeCloseTo(0.0206, 3);
    expect(rates.memory_per_gib_hour_usd).toBeCloseTo(0.0069, 3);
  });

  it('every price sheet normalizes to its reference instance', () => {
    for (const sheet of sheets) {
      expect(ratesNormalizeToReference(sheet)).toBe(true);
    }
  });
});

describe('computeNodeFloorMonthly', () => {
  const aws = sheets.find((s) => s.provider === 'aws')!;

  it('fits nginx workload on one t3.medium via catalog', () => {
    const { nodes, monthlyUsd, instanceType } = computeNodeFloorMonthly(
      1.5,
      1.5,
      aws,
    );
    expect(nodes).toBe(1);
    expect(instanceType).toBe('t3.medium');
    expect(monthlyUsd).toBeCloseTo(30.37, 0);
  });

  it('picks cheaper catalog VM for small workloads', () => {
    const floor = cheapestNodeFloor(1.5, 1.5, aws);
    expect(floor.instanceType).toBe('t3.medium');
    expect(floor.monthlyUsd).toBeLessThan(40);
  });
});
