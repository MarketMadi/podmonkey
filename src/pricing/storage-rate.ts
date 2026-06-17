import type { PriceSheet } from '../types';

const CLASS_ALIASES: Record<string, string[]> = {
  gp3: ['gp3', 'gp2', 'standard', 'default'],
  gp2: ['gp2', 'gp3'],
  io2: ['io2', 'io1'],
  'pd-ssd': ['pd-ssd', 'ssd', 'premium'],
  'pd-standard': ['pd-standard', 'standard', 'hdd'],
  'managed-premium': ['managed-premium', 'premium', 'premium-ssd'],
  'managed-standard': ['managed-standard', 'standard', 'standardssd'],
  volume: ['volume', 'hcloud-volumes'],
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

export function storageRateGiBMonth(
  sheet: PriceSheet,
  storageClass?: string,
): number {
  const keys = storageKeys(sheet);

  if (storageClass) {
    const normalized = storageClass.toLowerCase();
    for (const key of keys) {
      const prefix = key.replace(/_per_gib_month_usd$/, '');
      const aliases = CLASS_ALIASES[prefix] ?? [prefix];
      if (aliases.some((a) => normalized.includes(a.replace(/-/g, '')) || normalized === a)) {
        const rate = rateForKey(sheet, key);
        if (rate !== null) return rate;
      }
    }
    for (const key of keys) {
      if (normalized.includes(key.replace(/_per_gib_month_usd$/, ''))) {
        const rate = rateForKey(sheet, key);
        if (rate !== null) return rate;
      }
    }
  }

  const defaultClass = sheet.storage.default_class;
  if (defaultClass) {
    const match = keys.find((k) =>
      k.startsWith(String(defaultClass).replace(/-/g, '_').replace(/-/g, '_')),
    );
    if (match) {
      const rate = rateForKey(sheet, match);
      if (rate !== null) return rate;
    }
    for (const key of keys) {
      if (key.includes(String(defaultClass).replace(/-/g, '_'))) {
        const rate = rateForKey(sheet, key);
        if (rate !== null) return rate;
      }
    }
  }

  const first = keys[0];
  if (first) {
    const rate = rateForKey(sheet, first);
    if (rate !== null) return rate;
  }

  return 0.08;
}
