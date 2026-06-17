import type { PriceSheet } from '../types';

/** OpenCost Appendix A: CPU weighted 3× per GiB RAM when deriving marginal rates. */
const CPU_UNIT_WEIGHT = 3;

export interface DerivedRates {
  cpu_per_vcpu_hour_usd: number;
  memory_per_gib_hour_usd: number;
}

/**
 * Derive marginal CPU/RAM hourly rates from a reference on-demand instance so
 * component costs sum to the node hourly price (OpenCost Appendix A).
 */
export function deriveRatesFromReference(
  ref: PriceSheet['reference_instance'],
): DerivedRates {
  const { vcpu, memory_gib, hourly_usd } = ref;
  const totalUnits = vcpu * CPU_UNIT_WEIGHT + memory_gib;
  const cpuShare = (vcpu * CPU_UNIT_WEIGHT) / totalUnits;
  const memShare = memory_gib / totalUnits;

  return {
    cpu_per_vcpu_hour_usd: (hourly_usd * cpuShare) / vcpu,
    memory_per_gib_hour_usd: (hourly_usd * memShare) / memory_gib,
  };
}

/** Verify derived rates reconstruct the reference instance hourly price. */
export function ratesNormalizeToReference(
  sheet: PriceSheet,
  tolerance = 0.0001,
): boolean {
  const { vcpu, memory_gib, hourly_usd } = sheet.reference_instance;
  const rates = deriveRatesFromReference(sheet.reference_instance);
  const reconstructed =
    vcpu * rates.cpu_per_vcpu_hour_usd +
    memory_gib * rates.memory_per_gib_hour_usd;
  return Math.abs(reconstructed - hourly_usd) <= tolerance;
}

export function resolveRates(sheet: PriceSheet): DerivedRates {
  return deriveRatesFromReference(sheet.reference_instance);
}
