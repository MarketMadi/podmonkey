import { fetchJson, requireEnv, roundUsd } from './fetch';

const GCP_COMPUTE_SERVICE_ID = '6F81-5844-456A';
const GCP_BILLING_BASE = 'https://cloudbilling.googleapis.com/v1';

interface GcpSkuPage {
  skus: GcpSku[];
  nextPageToken?: string;
}

interface GcpSku {
  skuId: string;
  description: string;
  category: {
    resourceFamily: string;
    resourceGroup: string;
    usageType: string;
  };
  serviceRegions: string[];
  pricingInfo: Array<{
    pricingExpression: {
      usageUnit: string;
      tieredRates: Array<{
        unitPrice: {
          units: string;
          nanos: number;
        };
      }>;
    };
  }>;
}

function skuHourlyUsd(sku: GcpSku): number | null {
  const info = sku.pricingInfo[0];
  if (!info) return null;
  if (info.pricingExpression.usageUnit !== 'h') return null;

  const rate = info.pricingExpression.tieredRates[0]?.unitPrice;
  if (!rate) return null;

  const hourly = parseInt(rate.units, 10) + rate.nanos / 1e9;
  return hourly > 0 ? roundUsd(hourly) : null;
}

async function loadAllGcpSkus(apiKey: string): Promise<GcpSku[]> {
  const skus: GcpSku[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      currencyCode: 'USD',
      pageSize: '5000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await fetchJson<GcpSkuPage>(
      `${GCP_BILLING_BASE}/services/${GCP_COMPUTE_SERVICE_ID}/skus?${params}`,
      { timeoutMs: 120_000 },
    );

    skus.push(...page.skus);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return skus;
}

function matchesGcpVmSku(
  sku: GcpSku,
  region: string,
  machineType: string,
): boolean {
  if (!sku.serviceRegions.includes(region)) return false;
  if (sku.category.resourceFamily !== 'Compute') return false;
  if (sku.category.usageType !== 'OnDemand') return false;
  if (!sku.description.includes(machineType)) return false;
  if (sku.description.includes('Spot')) return false;
  if (sku.description.includes('Preemptible')) return false;
  if (sku.description.includes('Commitment')) return false;
  if (sku.description.toLowerCase().includes('sole tenancy')) return false;
  return true;
}

export async function fetchGcpVmHourly(
  region: string,
  machineType: string,
  strict: boolean,
): Promise<number> {
  const apiKey = requireEnv('GCP_API_KEY', strict);
  if (!apiKey) {
    throw new Error('GCP_API_KEY not set');
  }

  const skus = await loadAllGcpSkus(apiKey);
  const candidates = skus.filter((sku) =>
    matchesGcpVmSku(sku, region, machineType),
  );

  const priced = candidates
    .map((sku) => ({ sku, hourly: skuHourlyUsd(sku) }))
    .filter((x): x is { sku: GcpSku; hourly: number } => x.hourly != null);

  if (priced.length === 0) {
    throw new Error(
      `No on-demand VM price for ${machineType} in ${region} (GCP Cloud Billing Catalog API)`,
    );
  }

  priced.sort((a, b) => a.hourly - b.hourly);
  return priced[0].hourly;
}

export async function fetchGcpVmHourlyMany(
  region: string,
  machineTypes: string[],
  strict: boolean,
): Promise<Map<string, number>> {
  const apiKey = requireEnv('GCP_API_KEY', strict);
  if (!apiKey) {
    throw new Error('GCP_API_KEY not set');
  }

  const skus = await loadAllGcpSkus(apiKey);
  const prices = new Map<string, number>();

  for (const machineType of machineTypes) {
    const candidates = skus.filter((sku) =>
      matchesGcpVmSku(sku, region, machineType),
    );
    const priced = candidates
      .map((sku) => skuHourlyUsd(sku))
      .filter((h): h is number => h != null);

    if (priced.length === 0) {
      throw new Error(
        `No on-demand VM price for ${machineType} in ${region} (GCP Cloud Billing Catalog API)`,
      );
    }

    prices.set(machineType, Math.min(...priced));
  }

  return prices;
}

function matchesGcpDiskSku(
  sku: GcpSku,
  region: string,
  diskType: 'pd-standard' | 'pd-balanced' | 'pd-ssd',
): boolean {
  if (!sku.serviceRegions.includes(region)) return false;
  if (sku.category.resourceFamily !== 'Storage') return false;
  if (sku.category.usageType !== 'OnDemand') return false;
  if (sku.pricingInfo[0]?.pricingExpression.usageUnit !== 'GiBy.mo') return false;

  const desc = sku.description.toLowerCase();
  if (diskType === 'pd-standard') {
    return desc.includes('pd standard') || desc.includes('standard provisioned space');
  }
  if (diskType === 'pd-balanced') {
    return desc.includes('pd balanced') || desc.includes('balanced provisioned space');
  }
  return desc.includes('pd ssd') || desc.includes('ssd provisioned space');
}

export async function fetchGcpDiskPerGibMonth(
  region: string,
  strict: boolean,
): Promise<{ pd_standard: number; pd_balanced: number; pd_ssd: number }> {
  const apiKey = requireEnv('GCP_API_KEY', strict);
  if (!apiKey) {
    throw new Error('GCP_API_KEY not set');
  }

  const skus = await loadAllGcpSkus(apiKey);
  const result: Record<string, number> = {};

  for (const diskType of ['pd-standard', 'pd-balanced', 'pd-ssd'] as const) {
    const match = skus.find((sku) => matchesGcpDiskSku(sku, region, diskType));
    if (!match) {
      throw new Error(
        `Missing ${diskType} disk price for ${region} (GCP Cloud Billing Catalog API)`,
      );
    }
    const info = match.pricingInfo[0];
    const rate = info.pricingExpression.tieredRates[0]?.unitPrice;
    if (!rate) {
      throw new Error(`Invalid pricing for ${diskType} in ${region}`);
    }
    const monthly = parseInt(rate.units, 10) + rate.nanos / 1e9;
    result[diskType.replace('-', '_')] = roundUsd(monthly, 4);
  }

  return {
    pd_standard: result.pd_standard,
    pd_balanced: result.pd_balanced,
    pd_ssd: result.pd_ssd,
  };
}

export const GCP_GKE_CONTROL_PLANE_HOURLY = 0.1;
export const GCP_LB_MONTHLY_USD = 18.0;

export const GCP_SOURCES = [
  'https://cloud.google.com/kubernetes-engine/pricing',
  'https://cloudbilling.googleapis.com/v1/services/6F81-5844-456A/skus',
  'https://cloud.google.com/compute/disks-pricing',
];
