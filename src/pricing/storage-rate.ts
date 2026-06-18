import type { PriceSheet } from '../types';

/**
 * Maps Kubernetes storageClassName values to price sheet storage tier keys.
 * Keys are normalized substrings (lowercase, no hyphens).
 */
const CLASS_ALIASES: Record<string, string[]> = {
  // AWS EBS
  gp3: ['gp3', 'ebsgp3', 'ebs-sc', 'default'],
  gp2: ['gp2', 'ebsgp2'],
  io1: ['io1', 'io'],
  io2: ['io2', 'io1'],
  st1: ['st1', 'throughput'],
  sc1: ['sc1', 'cold', 'hdd'],
  // GCP PD
  pd_ssd: ['pdssd', 'ssd', 'premium-rwo', 'premiumrwo'],
  pd_balanced: ['pdbalanced', 'balanced', 'standard-rwo'],
  pd_standard: ['pdstandard', 'standard', 'hdd'],
  // Azure managed disks
  managed_premium: [
    'managedpremium',
    'premium',
    'premiumssd',
    'managed-csi-premium',
    'default',
  ],
  managed_standard: ['managedstandard', 'standardssd', 'managed-csi'],
  azurefile: ['azurefile', 'file'],
  // Hetzner
  volume: ['volume', 'hcloudvolumes', 'hcloud-volumes', 'csi'],
};

function storageKeys(sheet: PriceSheet): string[] {
  return Object.keys(sheet.storage).filter((k) =>
    k.endsWith('_per_gib_month_usd'),
  );
}

function rateForKey(sheet: PriceSheet, key: string): number | null {
  const val = sheet.storage[key];
  return typeof val === 'number' ? val : null;
}

function normalizeClass(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, '');
}

function matchStorageKey(
  keys: string[],
  storageClass: string,
): string | null {
  const normalized = normalizeClass(storageClass);

  for (const key of keys) {
    const prefix = key.replace(/_per_gib_month_usd$/, '');
    const aliases = CLASS_ALIASES[prefix] ?? [prefix.replace(/_/g, '')];
    if (aliases.some((a) => normalized.includes(a) || normalized === a)) {
      return key;
    }
  }

  for (const key of keys) {
    const prefix = key.replace(/_per_gib_month_usd$/, '').replace(/_/g, '');
    if (normalized.includes(prefix)) return key;
  }

  return null;
}

export function storageRateGiBMonth(
  sheet: PriceSheet,
  storageClass?: string,
): number {
  const keys = storageKeys(sheet);

  if (storageClass) {
    const matched = matchStorageKey(keys, storageClass);
    if (matched) {
      const rate = rateForKey(sheet, matched);
      if (rate !== null) return rate;
    }
  }

  const defaultClass = sheet.storage.default_class;
  if (defaultClass) {
    const matched = matchStorageKey(keys, String(defaultClass));
    if (matched) {
      const rate = rateForKey(sheet, matched);
      if (rate !== null) return rate;
    }
  }

  const first = keys[0];
  if (first) {
    const rate = rateForKey(sheet, first);
    if (rate !== null) return rate;
  }

  return 0.08;
}

/** Exposed for tests — resolve which tier key matched. */
export function resolveStorageTierKey(
  sheet: PriceSheet,
  storageClass?: string,
): string | null {
  const keys = storageKeys(sheet);
  if (!storageClass) return null;
  return matchStorageKey(keys, storageClass);
}
