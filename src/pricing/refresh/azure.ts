import { fetchJson, roundUsd } from './fetch';

const AZURE_RETAIL_BASE = 'https://prices.azure.com/api/retail/prices';

interface AzureRetailPage {
  Items: AzureRetailItem[];
  NextPageLink?: string;
}

interface AzureRetailItem {
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  armSkuName: string;
  skuName: string;
  productName: string;
  unitOfMeasure: string;
  type: string;
  priceType?: string;
  meterName?: string;
}

async function fetchAllRetailPrices(filter: string): Promise<AzureRetailItem[]> {
  const items: AzureRetailItem[] = [];
  let url: string | undefined =
    `${AZURE_RETAIL_BASE}?$filter=${encodeURIComponent(filter)}`;

  while (url) {
    const page: AzureRetailPage = await fetchJson<AzureRetailPage>(url, {
      timeoutMs: 120_000,
    });
    items.push(...page.Items);
    url = page.NextPageLink;
  }

  return items;
}

function isLinuxConsumptionVm(item: AzureRetailItem): boolean {
  return (
    item.type === 'Consumption' &&
    item.unitOfMeasure === '1 Hour' &&
    !item.skuName.includes('Spot') &&
    !item.skuName.includes('Low Priority') &&
    !item.productName.toLowerCase().includes('windows')
  );
}

export async function fetchAzureVmHourly(
  region: string,
  armSkuName: string,
): Promise<number> {
  const filter = [
    "serviceName eq 'Virtual Machines'",
    `armRegionName eq '${region}'`,
    `armSkuName eq '${armSkuName}'`,
    "priceType eq 'Consumption'",
  ].join(' and ');

  const items = await fetchAllRetailPrices(filter);
  const match = items.find(
    (item) => item.armSkuName === armSkuName && isLinuxConsumptionVm(item),
  );

  if (!match) {
    throw new Error(
      `No on-demand Linux VM price for ${armSkuName} in ${region} (Azure Retail Prices API)`,
    );
  }

  return roundUsd(match.retailPrice);
}

export async function fetchAzureVmHourlyMany(
  region: string,
  armSkuNames: string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  for (const sku of armSkuNames) {
    prices.set(sku, await fetchAzureVmHourly(region, sku));
  }

  return prices;
}

const S30_GIB = 1024;
const P30_GIB = 1024;

async function fetchAzureDiskMonthly(
  region: string,
  skuName: string,
): Promise<number> {
  const filter = [
    "serviceName eq 'Storage'",
    `armRegionName eq '${region}'`,
    `skuName eq '${skuName}'`,
    "priceType eq 'Consumption'",
  ].join(' and ');

  const items = await fetchAllRetailPrices(filter);
  const disk = items.find(
    (i) =>
      i.skuName === skuName &&
      i.unitOfMeasure === '1/Month' &&
      i.meterName?.includes('Disk') &&
      !i.meterName.includes('Mount') &&
      !i.meterName.includes('Operations'),
  );

  if (!disk) {
    throw new Error(
      `No monthly disk price for ${skuName} in ${region} (Azure Retail Prices API)`,
    );
  }

  return disk.retailPrice;
}

export async function fetchAzureDiskPerGibMonth(
  region: string,
): Promise<{ standard: number; premium: number }> {
  const s30Monthly = await fetchAzureDiskMonthly(region, 'S30 LRS');
  const p30Monthly = await fetchAzureDiskMonthly(region, 'P30 LRS');

  return {
    standard: roundUsd(s30Monthly / S30_GIB, 4),
    premium: roundUsd(p30Monthly / P30_GIB, 4),
  };
}

export const AZURE_AKS_CONTROL_PLANE_HOURLY = 0.1;
export const AZURE_LB_MONTHLY_USD = 18.0;

export const AZURE_SOURCES = [
  'https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/',
  'https://prices.azure.com/api/retail/prices',
  'https://azure.microsoft.com/en-us/pricing/details/managed-disks/',
];
