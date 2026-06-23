import { join } from 'node:path';
import {
  AWS_EC2_US_EAST_1,
  AWS_GPU_US_EAST_1,
  AZURE_EASTUS,
  AZURE_GPU_EASTUS,
  GCP_GPU_US_CENTRAL1,
  GCP_US_CENTRAL1,
  HETZNER_FSN1,
  HETZNER_GPU_FSN1,
} from './catalog-specs';
import {
  AWS_ALB_MONTHLY_USD,
  AWS_EKS_CONTROL_PLANE_HOURLY,
  AWS_SOURCES,
  fetchAwsEbsPerGibMonth,
  fetchAwsEc2HourlyMany,
} from './aws';
import {
  AZURE_AKS_CONTROL_PLANE_HOURLY,
  AZURE_LB_MONTHLY_USD,
  AZURE_SOURCES,
  fetchAzureDiskPerGibMonth,
  fetchAzureVmHourlyMany,
} from './azure';
import {
  GCP_GKE_CONTROL_PLANE_HOURLY,
  GCP_LB_MONTHLY_USD,
  GCP_SOURCES,
  fetchGcpDiskPerGibMonth,
  fetchGcpVmHourlyMany,
} from './gcp';
import {
  HETZNER_SOURCES,
  fetchEurToUsd,
  fetchHetznerHourlyUsdMany,
  fetchHetznerLoadBalancerMonthlyUsd,
  fetchHetznerVolumePerGibMonthUsd,
} from './hetzner';
import { gpuPricingDir, pricingRoot, withDerivedRates, writeJson } from './write';
import type { GpuPriceSheet, PriceSheet } from '../../types';
import type { RefreshContext, RefreshResult } from './types';

const HOURS_PER_MONTH = 730;

function failOrSkip(
  ctx: RefreshContext,
  provider: string,
  error: unknown,
): null {
  const message = error instanceof Error ? error.message : String(error);
  if (ctx.strict) {
    throw new Error(`[${provider}] ${message}`);
  }
  console.warn(`[${provider}] skipped: ${message}`);
  return null;
}

export async function refreshAllPricing(ctx: RefreshContext): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  if (ctx.eurToUsd <= 0) {
    throw new Error('Invalid EUR/USD exchange rate');
  }

  const aws = await refreshAws(ctx);
  if (aws) results.push(aws);

  const azure = await refreshAzure(ctx);
  if (azure) results.push(azure);

  const gcp = await refreshGcp(ctx);
  if (gcp) results.push(gcp);

  const hetzner = await refreshHetzner(ctx);
  if (hetzner) results.push(hetzner);

  const awsGpu = await refreshAwsGpu(ctx);
  if (awsGpu) results.push(awsGpu);

  const azureGpu = await refreshAzureGpu(ctx);
  if (azureGpu) results.push(azureGpu);

  const gcpGpu = await refreshGcpGpu(ctx);
  if (gcpGpu) results.push(gcpGpu);

  const hetznerGpu = await refreshHetznerGpu(ctx);
  if (hetznerGpu) results.push(hetznerGpu);

  if (ctx.strict && results.length < 8) {
    throw new Error(
      `Strict refresh expected 8 sheets; only updated ${results.length}. Check API credentials.`,
    );
  }

  return results;
}

async function refreshAws(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'aws';
  try {
    const region = 'us-east-1';
    const types = AWS_EC2_US_EAST_1.map((i) => i.type);
    const prices = await fetchAwsEc2HourlyMany(region, types);
    const ebs = await fetchAwsEbsPerGibMonth(region);

    const reference = AWS_EC2_US_EAST_1.find((i) => i.type === 'm6i.large')!;
    const refHourly = prices.get('m6i.large')!;

    const sheet: PriceSheet = withDerivedRates({
      provider: 'aws',
      service: 'eks',
      region,
      as_of: ctx.asOf,
      fetched_at: ctx.fetchedAt,
      sources: AWS_SOURCES,
      hours_per_month: HOURS_PER_MONTH,
      control_plane: {
        hourly_usd: AWS_EKS_CONTROL_PLANE_HOURLY,
        tier: 'standard',
        notes: 'EKS standard support $0.10/hr; extended support $0.60/hr after version EOL',
      },
      reference_instance: {
        type: reference.type,
        vcpu: reference.vcpu,
        memory_gib: reference.memory_gib,
        hourly_usd: refHourly,
        notes: 'Linux on-demand us-east-1 (AWS Price List API)',
      },
      instance_catalog: AWS_EC2_US_EAST_1.map((inst) => ({
        type: inst.type,
        vcpu: inst.vcpu,
        memory_gib: inst.memory_gib,
        hourly_usd: prices.get(inst.type)!,
      })),
      storage: {
        gp3_per_gib_month_usd: ebs.gp3,
        gp2_per_gib_month_usd: ebs.gp2,
        io1_per_gib_month_usd: ebs.io1,
        io2_per_gib_month_usd: ebs.io2,
        st1_per_gib_month_usd: ebs.st1,
        sc1_per_gib_month_usd: ebs.sc1,
        default_class: 'gp3',
      },
      load_balancer_monthly_usd: AWS_ALB_MONTHLY_USD,
      ingress_lb_monthly_usd: AWS_ALB_MONTHLY_USD,
      defaults: {
        missing_cpu: '100m',
        missing_memory: '128Mi',
        daemonset_node_count: 3,
      },
    });

    const path = join(pricingRoot(), 'aws-us-east-1.json');
    writeJson(path, sheet);
    return { provider: 'aws', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshAzure(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'azure';
  try {
    const region = 'eastus';
    const skus = AZURE_EASTUS.map((i) => i.type);
    const prices = await fetchAzureVmHourlyMany(region, skus);
    const disks = await fetchAzureDiskPerGibMonth(region);

    const reference = AZURE_EASTUS.find((i) => i.type === 'Standard_D2s_v5')!;
    const refHourly = prices.get('Standard_D2s_v5')!;

    const sheet: PriceSheet = withDerivedRates({
      provider: 'azure',
      service: 'aks',
      region,
      as_of: ctx.asOf,
      fetched_at: ctx.fetchedAt,
      sources: AZURE_SOURCES,
      hours_per_month: HOURS_PER_MONTH,
      control_plane: {
        hourly_usd: 0,
        tier: 'free',
        standard_hourly_usd: AZURE_AKS_CONTROL_PLANE_HOURLY,
        notes: 'AKS free tier default; standard SLA $0.10/hr',
      },
      reference_instance: {
        type: reference.type,
        vcpu: reference.vcpu,
        memory_gib: reference.memory_gib,
        hourly_usd: refHourly,
        notes: 'Linux on-demand eastus (Azure Retail Prices API)',
      },
      instance_catalog: AZURE_EASTUS.map((inst) => ({
        type: inst.type,
        vcpu: inst.vcpu,
        memory_gib: inst.memory_gib,
        hourly_usd: prices.get(inst.type)!,
      })),
      storage: {
        managed_standard_per_gib_month_usd: disks.standard,
        managed_premium_per_gib_month_usd: disks.premium,
        default_class: 'managed-premium',
      },
      load_balancer_monthly_usd: AZURE_LB_MONTHLY_USD,
      ingress_lb_monthly_usd: AZURE_LB_MONTHLY_USD,
      defaults: {
        missing_cpu: '100m',
        missing_memory: '128Mi',
        daemonset_node_count: 3,
      },
    });

    const path = join(pricingRoot(), 'azure-eastus.json');
    writeJson(path, sheet);
    return { provider: 'azure', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshGcp(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'gcp';
  try {
    const region = 'us-central1';
    const types = GCP_US_CENTRAL1.map((i) => i.type);
    const prices = await fetchGcpVmHourlyMany(region, types, ctx.strict);
    const disks = await fetchGcpDiskPerGibMonth(region, ctx.strict);

    const reference = GCP_US_CENTRAL1.find((i) => i.type === 'e2-standard-2')!;
    const refHourly = prices.get('e2-standard-2')!;

    const sheet: PriceSheet = withDerivedRates({
      provider: 'gcp',
      service: 'gke',
      region,
      as_of: ctx.asOf,
      fetched_at: ctx.fetchedAt,
      sources: GCP_SOURCES,
      hours_per_month: HOURS_PER_MONTH,
      control_plane: {
        hourly_usd: GCP_GKE_CONTROL_PLANE_HOURLY,
        tier: 'standard',
        free_zonal_cluster: true,
        notes: 'One free zonal Autopilot/Standard cluster per billing account',
      },
      reference_instance: {
        type: reference.type,
        vcpu: reference.vcpu,
        memory_gib: reference.memory_gib,
        hourly_usd: refHourly,
        notes: 'On-demand us-central1 Linux (GCP Cloud Billing Catalog API)',
      },
      instance_catalog: GCP_US_CENTRAL1.map((inst) => ({
        type: inst.type,
        vcpu: inst.vcpu,
        memory_gib: inst.memory_gib,
        hourly_usd: prices.get(inst.type)!,
      })),
      storage: {
        pd_standard_per_gib_month_usd: disks.pd_standard,
        pd_balanced_per_gib_month_usd: disks.pd_balanced,
        pd_ssd_per_gib_month_usd: disks.pd_ssd,
        default_class: 'pd-ssd',
      },
      load_balancer_monthly_usd: GCP_LB_MONTHLY_USD,
      ingress_lb_monthly_usd: GCP_LB_MONTHLY_USD,
      defaults: {
        missing_cpu: '100m',
        missing_memory: '128Mi',
        daemonset_node_count: 3,
      },
    });

    const path = join(pricingRoot(), 'gcp-us-central1.json');
    writeJson(path, sheet);
    return { provider: 'gcp', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshHetzner(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'hetzner';
  try {
    const location = 'fsn1';
    const types = HETZNER_FSN1.map((i) => i.type);
    const prices = await fetchHetznerHourlyUsdMany(
      types,
      location,
      ctx.eurToUsd,
      ctx.strict,
    );
    const volume = await fetchHetznerVolumePerGibMonthUsd(ctx.eurToUsd, ctx.strict);
    const lb = await fetchHetznerLoadBalancerMonthlyUsd(ctx.eurToUsd, ctx.strict);

    const reference = HETZNER_FSN1.find((i) => i.type === 'cx32')!;
    const refHourly = prices.get('cx32')!;

    const sheet: PriceSheet = withDerivedRates({
      provider: 'hetzner',
      service: 'k3s',
      region: location,
      as_of: ctx.asOf,
      fetched_at: ctx.fetchedAt,
      sources: HETZNER_SOURCES,
      hours_per_month: HOURS_PER_MONTH,
      control_plane: {
        hourly_usd: 0,
        tier: 'self-managed',
        notes: 'Self-managed k3s; no managed control plane fee',
      },
      reference_instance: {
        type: reference.type,
        vcpu: reference.vcpu,
        memory_gib: reference.memory_gib,
        hourly_usd: refHourly,
        notes: `CX32 shared vCPU ${location} (Hetzner Cloud API, EUR→USD ${ctx.eurToUsd})`,
      },
      instance_catalog: HETZNER_FSN1.map((inst) => ({
        type: inst.type,
        vcpu: inst.vcpu,
        memory_gib: inst.memory_gib,
        hourly_usd: prices.get(inst.type)!,
      })),
      storage: {
        volume_per_gib_month_usd: volume,
        default_class: 'volume',
      },
      load_balancer_monthly_usd: lb,
      ingress_lb_monthly_usd: 0,
      compute_model: 'node_only',
      defaults: {
        missing_cpu: '100m',
        missing_memory: '128Mi',
        daemonset_node_count: 3,
      },
    });

    const path = join(pricingRoot(), 'hetzner-fsn1.json');
    writeJson(path, sheet);
    return { provider: 'hetzner', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

function buildGpuSheet(
  provider: GpuPriceSheet['provider'],
  service: string,
  region: string,
  ctx: RefreshContext,
  sources: string[],
  catalog: typeof AWS_GPU_US_EAST_1,
  prices: Map<string, number>,
  priceSource: string,
  eurToUsd?: number,
): GpuPriceSheet {
  return {
    provider,
    service,
    region,
    as_of: ctx.asOf,
    fetched_at: ctx.fetchedAt,
    sources,
    hours_per_month: HOURS_PER_MONTH,
    currency: 'USD',
    ...(eurToUsd != null ? { eur_to_usd: eurToUsd } : {}),
    instances: catalog.map((inst) => {
      const key = inst.type.toLowerCase();
      const hourly = prices.get(key) ?? prices.get(inst.type);
      if (hourly == null) {
        throw new Error(`Missing fetched price for GPU instance ${inst.type}`);
      }
      return {
        type: inst.type,
        gpu_model: inst.gpu_model,
        gpu_count: inst.gpu_count,
        gpu_memory_gib: inst.gpu_memory_gib,
        vcpu: inst.vcpu,
        memory_gib: inst.memory_gib,
        hourly_usd: hourly,
        monthly_usd: Math.round(hourly * HOURS_PER_MONTH * 100) / 100,
        source: priceSource,
      };
    }),
  };
}

async function refreshAwsGpu(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'aws-gpu';
  try {
    const region = 'us-east-1';
    const types = AWS_GPU_US_EAST_1.map((i) => i.type);
    const prices = await fetchAwsEc2HourlyMany(region, types);

    const sheet = buildGpuSheet(
      'aws',
      'eks-gpu',
      region,
      ctx,
      AWS_SOURCES,
      AWS_GPU_US_EAST_1,
      new Map([...prices.entries()].map(([k, v]) => [k, v])),
      'AWS Price List API — AmazonEC2 on-demand Linux',
    );

    const path = join(gpuPricingDir(), 'aws-us-east-1.json');
    writeJson(path, sheet);
    return { provider: 'aws', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshAzureGpu(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'azure-gpu';
  try {
    const region = 'eastus';
    const skus = AZURE_GPU_EASTUS.map((i) => i.type);
    const prices = await fetchAzureVmHourlyMany(region, skus);

    const sheet = buildGpuSheet(
      'azure',
      'aks-gpu',
      region,
      ctx,
      AZURE_SOURCES,
      AZURE_GPU_EASTUS,
      prices,
      'Azure Retail Prices API — Linux on-demand',
    );

    const path = join(gpuPricingDir(), 'azure-eastus.json');
    writeJson(path, sheet);
    return { provider: 'azure', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshGcpGpu(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'gcp-gpu';
  try {
    const region = 'us-central1';
    const types = GCP_GPU_US_CENTRAL1.map((i) => i.type);
    const prices = await fetchGcpVmHourlyMany(region, types, ctx.strict);

    const sheet = buildGpuSheet(
      'gcp',
      'gke-gpu',
      region,
      ctx,
      GCP_SOURCES,
      GCP_GPU_US_CENTRAL1,
      prices,
      'GCP Cloud Billing Catalog API — on-demand',
    );

    const path = join(gpuPricingDir(), 'gcp-us-central1.json');
    writeJson(path, sheet);
    return { provider: 'gcp', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

async function refreshHetznerGpu(ctx: RefreshContext): Promise<RefreshResult | null> {
  const provider = 'hetzner-gpu';
  try {
    const location = 'fsn1';
    const types = HETZNER_GPU_FSN1.map((i) => i.type);
    const prices = await fetchHetznerHourlyUsdMany(
      types,
      location,
      ctx.eurToUsd,
      ctx.strict,
    );

    const sheet = buildGpuSheet(
      'hetzner',
      'k3s-gpu',
      location,
      ctx,
      HETZNER_SOURCES,
      HETZNER_GPU_FSN1,
      prices,
      `Hetzner Cloud API /pricing (${location}, net EUR × ${ctx.eurToUsd})`,
      ctx.eurToUsd,
    );

    const path = join(gpuPricingDir(), 'hetzner-fsn1.json');
    writeJson(path, sheet);
    return { provider: 'hetzner', updated: true, path, warnings: [] };
  } catch (error) {
    return failOrSkip(ctx, provider, error);
  }
}

export async function createRefreshContext(strict: boolean): Promise<RefreshContext> {
  const eurToUsd = await fetchEurToUsd();
  return {
    asOf: new Date().toISOString().slice(0, 10),
    fetchedAt: new Date().toISOString(),
    eurToUsd,
    strict,
  };
}
