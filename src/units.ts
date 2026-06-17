const CPU_SUFFIX: Record<string, number> = {
  m: 0.001,
  n: 1e-9,
  u: 1e-6,
};

/** Parse Kubernetes CPU quantity to cores (e.g. "500m" → 0.5). */
export function parseCpu(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([mun]?)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix && CPU_SUFFIX[suffix]) {
    return num * CPU_SUFFIX[suffix];
  }
  return num;
}

const BINARY = 1024;

/** Parse Kubernetes memory quantity to GiB. */
export function parseMemory(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value / (BINARY ** 3);

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([EPTGMK]i?)?$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const unit = match[2] ?? '';

  const bytesPerUnit: Record<string, number> = {
    Ei: BINARY ** 6,
    Pi: BINARY ** 5,
    Ti: BINARY ** 4,
    Gi: BINARY ** 3,
    G: 1e9,
    Mi: BINARY ** 2,
    M: 1e6,
    Ki: BINARY,
    K: 1e3,
    '': 1,
  };

  const bytes = num * (bytesPerUnit[unit] ?? 1);
  return bytes / (BINARY ** 3);
}

export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
