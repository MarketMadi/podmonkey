export type ProviderId = 'aws' | 'gcp' | 'azure' | 'hetzner';

export interface ResourceQuantity {
  cpuCores: number;
  memoryGiB: number;
}

export interface ContainerResources {
  name: string;
  image: string;
  cpuCores: number;
  memoryGiB: number;
  usedLimitsAsProxy: boolean;
  usedDefaults: boolean;
}

export interface ParsedWorkload {
  kind: string;
  name: string;
  namespace: string;
  replicas: number;
  containers: ContainerResources[];
}

export interface ParsedPVC {
  name: string;
  namespace: string;
  storageGiB: number;
  storageClass?: string;
}

export interface ParsedService {
  name: string;
  namespace: string;
  type: string;
}

export interface ParseResult {
  workloads: ParsedWorkload[];
  pvcs: ParsedPVC[];
  services: ParsedService[];
}

export interface PriceSheet {
  provider: ProviderId;
  service: string;
  region: string;
  as_of: string;
  sources: string[];
  hours_per_month: number;
  control_plane: {
    hourly_usd: number;
    tier?: string;
    free_zonal_cluster?: boolean;
    standard_hourly_usd?: number;
    notes?: string;
  };
  reference_instance: {
    type: string;
    vcpu: number;
    memory_gib: number;
    hourly_usd: number;
    notes?: string;
  };
  rates: {
    cpu_per_vcpu_hour_usd: number;
    memory_per_gib_hour_usd: number;
    gpu_per_hour_usd: number | null;
    derivation?: string;
  };
  storage: Record<string, number | string> & {
    default_class?: string;
  };
  load_balancer_monthly_usd: number;
  defaults: {
    missing_cpu: string;
    missing_memory: string;
    daemonset_node_count: number;
  };
}

export interface CostLineItem {
  category: 'compute' | 'storage' | 'load_balancer' | 'control_plane';
  label: string;
  monthlyUsd: number;
}

export interface ProviderEstimate {
  provider: ProviderId;
  region: string;
  asOf: string;
  totalMonthlyUsd: number;
  lineItems: CostLineItem[];
}

export type WarningSeverity = 'info' | 'warning';

export interface Warning {
  id: string;
  severity: WarningSeverity;
  message: string;
  resource?: string;
}

export interface EstimateOptions {
  /** Use GKE free zonal cluster (zero control plane) */
  gkeFreeTier?: boolean;
  /** AKS tier: free (default) or standard */
  aksTier?: 'free' | 'standard';
  daemonsetNodeCount?: number;
}

export interface WorkloadSummary {
  kind: string;
  name: string;
  namespace: string;
  replicas: number;
  /** Total CPU cores requested (containers × replicas). */
  cpuCores: number;
  /** Total memory GiB requested (containers × replicas). */
  memoryGiB: number;
  /** Compute-only monthly cost per provider (no control plane / LB / PVC). */
  computeMonthlyUsd: Partial<Record<ProviderId, number>>;
}

export interface EstimateResult {
  providers: ProviderEstimate[];
  warnings: Warning[];
  workloads: WorkloadSummary[];
  totals: {
    cpuCores: number;
    memoryGiB: number;
    storageGiB: number;
    loadBalancerCount: number;
  };
}
