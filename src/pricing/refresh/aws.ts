import { fetchJson, roundUsd } from './fetch';

const AWS_PRICING_BASE =
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';

interface AwsOfferIndex {
  products: Record<
    string,
    {
      sku: string;
      attributes: Record<string, string>;
    }
  >;
  terms: {
    OnDemand: Record<
      string,
      Record<
        string,
        {
          priceDimensions: Record<
            string,
            {
              pricePerUnit: { USD?: string };
            }
          >;
        }
      >
    >;
  };
}

const ec2IndexCache = new Map<string, AwsOfferIndex>();

async function loadEc2Index(region: string): Promise<AwsOfferIndex> {
  const cached = ec2IndexCache.get(region);
  if (cached) return cached;

  const index = await fetchJson<AwsOfferIndex>(
    `${AWS_PRICING_BASE}/AmazonEC2/current/${region}/index.json`,
    { timeoutMs: 180_000 },
  );
  ec2IndexCache.set(region, index);
  return index;
}

function onDemandLinuxHourly(
  index: AwsOfferIndex,
  instanceType: string,
): number | null {
  const product = Object.values(index.products).find(
    (p) =>
      p.attributes.instanceType === instanceType &&
      p.attributes.operatingSystem === 'Linux' &&
      p.attributes.tenancy === 'Shared' &&
      p.attributes.preInstalledSw === 'NA' &&
      p.attributes.capacitystatus === 'Used',
  );

  if (!product) return null;

  const onDemand = index.terms.OnDemand[product.sku];
  if (!onDemand) return null;

  const term = Object.values(onDemand)[0];
  const dimension = Object.values(term.priceDimensions)[0];
  const usd = dimension?.pricePerUnit?.USD;
  if (!usd) return null;

  const hourly = parseFloat(usd);
  return hourly > 0 ? roundUsd(hourly) : null;
}

export async function fetchAwsEc2Hourly(
  region: string,
  instanceType: string,
): Promise<number> {
  const index = await loadEc2Index(region);
  const hourly = onDemandLinuxHourly(index, instanceType);
  if (hourly == null) {
    throw new Error(
      `No on-demand Linux price for ${instanceType} in ${region} (AWS Price List API)`,
    );
  }
  return hourly;
}

export async function fetchAwsEc2HourlyMany(
  region: string,
  instanceTypes: string[],
): Promise<Map<string, number>> {
  const index = await loadEc2Index(region);
  const prices = new Map<string, number>();

  for (const type of instanceTypes) {
    const hourly = onDemandLinuxHourly(index, type);
    if (hourly == null) {
      throw new Error(
        `No on-demand Linux price for ${type} in ${region} (AWS Price List API)`,
      );
    }
    prices.set(type, hourly);
  }

  return prices;
}

/** EBS $/GiB-month by volume API name (gp2, gp3, io1, io2, st1, sc1). */
export async function fetchAwsEbsPerGibMonth(
  region: string,
): Promise<Record<string, number>> {
  const index = await loadEc2Index(region);
  const rates: Record<string, number> = {};

  const usageByVolume: Record<string, string> = {
    gp2: 'EBS:VolumeUsage.gp2',
    gp3: 'EBS:VolumeUsage.gp3',
    io1: 'EBS:VolumeUsage.piops',
    io2: 'EBS:VolumeUsage.io2',
    st1: 'EBS:VolumeUsage.st1',
    sc1: 'EBS:VolumeUsage.sc1',
  };

  for (const product of Object.values(index.products)) {
    const attrs = product.attributes;
    if (attrs.regionCode !== region) continue;

    const volumeApi = attrs.volumeApiName?.toLowerCase();
    if (!volumeApi) continue;

    const expectedUsage = usageByVolume[volumeApi];
    if (!expectedUsage || attrs.usagetype !== expectedUsage) continue;

    const onDemand = index.terms.OnDemand[product.sku];
    if (!onDemand) continue;

    const dimension = Object.values(Object.values(onDemand)[0].priceDimensions)[0];
    const usd = dimension?.pricePerUnit?.USD;
    if (!usd) continue;

    const perGbMonth = parseFloat(usd);
    if (perGbMonth > 0) {
      rates[volumeApi] = roundUsd(perGbMonth, 4);
    }
  }

  const required = ['gp2', 'gp3', 'io1', 'io2', 'st1', 'sc1'];
  for (const vol of required) {
    if (rates[vol] == null) {
      throw new Error(
        `Missing EBS ${vol} VolumeUsage price for ${region} (AWS Price List API / AmazonEC2)`,
      );
    }
  }

  return rates;
}

export const AWS_EKS_CONTROL_PLANE_HOURLY = 0.1;
export const AWS_ALB_MONTHLY_USD = 18.0;

export const AWS_SOURCES = [
  'https://aws.amazon.com/eks/pricing/',
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json',
  'https://aws.amazon.com/elasticloadbalancing/pricing/',
];
