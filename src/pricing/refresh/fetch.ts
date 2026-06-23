const DEFAULT_TIMEOUT_MS = 120_000;

export class RefreshError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = 'RefreshError';
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function roundUsd(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function requireEnv(name: string, strict: boolean): string | undefined {
  const value = process.env[name]?.trim();
  if (!value && strict) {
    throw new RefreshError(`Missing required env var ${name}`, name);
  }
  return value || undefined;
}
