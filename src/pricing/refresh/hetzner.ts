import { fetchJson, requireEnv, roundUsd } from './fetch';

const HETZNER_API_BASE = 'https://api.hetzner.cloud/v1';

interface HetznerPricingResponse {
  pricing: {
    currency: string;
    server_types: Array<{
      name: string;
      prices: Array<{
        location: string;
        price_hourly: { net: string; gross: string };
      }>;
    }>;
    volume?: {
      price_per_gb_month?: { net: string; gross: string };
    };
    load_balancer?: {
      price_monthly?: { net: string; gross: string };
    };
  };
}

interface HetznerServerTypesResponse {
  server_types: Array<{
    name: string;
    cores: number;
    memory: number;
  }>;
}

async function hetznerGet<T>(path: string, token: string): Promise<T> {
  return fetchJson<T>(`${HETZNER_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchEurToUsd(): Promise<number> {
  const data = await fetchJson<{ rates: { USD: number } }>(
    'https://open.er-api.com/v6/latest/EUR',
  );
  const rate = data.rates?.USD;
  if (!rate || rate <= 0) {
    throw new Error('Invalid EUR/USD rate from open.er-api.com');
  }
  return roundUsd(rate, 6);
}

export async function fetchHetznerHourlyEur(
  serverType: string,
  location: string,
  strict: boolean,
): Promise<number> {
  const token = requireEnv('HETZNER_API_TOKEN', strict);
  if (!token) {
    throw new Error('HETZNER_API_TOKEN not set');
  }

  const { pricing } = await hetznerGet<HetznerPricingResponse>('/pricing', token);
  const entry = pricing.server_types.find(
    (s) => s.name.toLowerCase() === serverType.toLowerCase(),
  );

  if (!entry) {
    throw new Error(
      `No price for Hetzner server type ${serverType} (Hetzner Cloud API /pricing)`,
    );
  }

  const locPrice = entry.prices.find((p) => p.location === location);
  if (!locPrice) {
    throw new Error(
      `No ${location} price for Hetzner ${serverType} (Hetzner Cloud API /pricing)`,
    );
  }

  const hourlyEur = parseFloat(locPrice.price_hourly.net);
  if (!hourlyEur || hourlyEur <= 0) {
    throw new Error(`Invalid hourly EUR for Hetzner ${serverType}`);
  }

  return roundUsd(hourlyEur, 6);
}

export async function fetchHetznerHourlyUsdMany(
  serverTypes: string[],
  location: string,
  eurToUsd: number,
  strict: boolean,
): Promise<Map<string, number>> {
  const token = requireEnv('HETZNER_API_TOKEN', strict);
  if (!token) {
    throw new Error('HETZNER_API_TOKEN not set');
  }

  const { pricing } = await hetznerGet<HetznerPricingResponse>('/pricing', token);
  const prices = new Map<string, number>();

  for (const serverType of serverTypes) {
    const entry = pricing.server_types.find(
      (s) => s.name.toLowerCase() === serverType.toLowerCase(),
    );
    if (!entry) {
      throw new Error(
        `No price for Hetzner server type ${serverType} (Hetzner Cloud API /pricing)`,
      );
    }

    const locPrice = entry.prices.find((p) => p.location === location);
    if (!locPrice) {
      throw new Error(
        `No ${location} price for Hetzner ${serverType} (Hetzner Cloud API /pricing)`,
      );
    }

    const hourlyEur = parseFloat(locPrice.price_hourly.net);
    if (!hourlyEur || hourlyEur <= 0) {
      throw new Error(`Invalid hourly EUR for Hetzner ${serverType}`);
    }

    prices.set(serverType.toLowerCase(), roundUsd(hourlyEur * eurToUsd));
  }

  return prices;
}

export async function fetchHetznerVolumePerGibMonthUsd(
  eurToUsd: number,
  strict: boolean,
): Promise<number> {
  const token = requireEnv('HETZNER_API_TOKEN', strict);
  if (!token) {
    throw new Error('HETZNER_API_TOKEN not set');
  }

  const { pricing } = await hetznerGet<HetznerPricingResponse>('/pricing', token);
  const net = pricing.volume?.price_per_gb_month?.net;
  if (!net) {
    throw new Error('Missing Hetzner volume price (Hetzner Cloud API /pricing)');
  }

  const eur = parseFloat(net);
  if (!eur || eur <= 0) {
    throw new Error('Invalid Hetzner volume EUR price');
  }

  return roundUsd(eur * eurToUsd, 4);
}

export async function fetchHetznerLoadBalancerMonthlyUsd(
  eurToUsd: number,
  strict: boolean,
): Promise<number> {
  const token = requireEnv('HETZNER_API_TOKEN', strict);
  if (!token) {
    throw new Error('HETZNER_API_TOKEN not set');
  }

  const { pricing } = await hetznerGet<HetznerPricingResponse>('/pricing', token);
  const net = pricing.load_balancer?.price_monthly?.net;
  if (!net) {
    throw new Error('Missing Hetzner load balancer price (Hetzner Cloud API /pricing)');
  }

  const eur = parseFloat(net);
  if (!eur || eur <= 0) {
    throw new Error('Invalid Hetzner load balancer EUR price');
  }

  return roundUsd(eur * eurToUsd, 2);
}

export async function verifyHetznerServerTypes(
  expected: string[],
  strict: boolean,
): Promise<void> {
  const token = requireEnv('HETZNER_API_TOKEN', strict);
  if (!token) return;

  const { server_types } = await hetznerGet<HetznerServerTypesResponse>(
    '/server_types',
    token,
  );

  for (const name of expected) {
    const found = server_types.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (!found) {
      throw new Error(`Hetzner server type ${name} not found in /server_types API`);
    }
  }
}

export const HETZNER_SOURCES = [
  'https://api.hetzner.cloud/v1/pricing',
  'https://api.hetzner.cloud/v1/server_types',
  'https://open.er-api.com/v6/latest/EUR',
];
