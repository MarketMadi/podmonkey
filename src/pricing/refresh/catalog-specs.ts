export interface CatalogInstance {
  type: string;
  vcpu: number;
  memory_gib: number;
}

export interface GpuCatalogInstance extends CatalogInstance {
  gpu_model: string;
  gpu_count: number;
  gpu_memory_gib: number;
}

/**
 * Hardware metadata only — not prices.
 * Sources: provider instance type documentation pages.
 */

export const AWS_EC2_US_EAST_1: CatalogInstance[] = [
  { type: 't4g.medium', vcpu: 2, memory_gib: 4 },
  { type: 't3.medium', vcpu: 2, memory_gib: 4 },
  { type: 'm6i.large', vcpu: 2, memory_gib: 8 },
  { type: 'm6i.xlarge', vcpu: 4, memory_gib: 16 },
  { type: 'm6i.2xlarge', vcpu: 8, memory_gib: 32 },
];

export const AWS_GPU_US_EAST_1: GpuCatalogInstance[] = [
  {
    type: 'g4dn.xlarge',
    gpu_model: 'NVIDIA T4',
    gpu_count: 1,
    vcpu: 4,
    memory_gib: 16,
    gpu_memory_gib: 16,
  },
  {
    type: 'g4dn.2xlarge',
    gpu_model: 'NVIDIA T4',
    gpu_count: 1,
    vcpu: 8,
    memory_gib: 32,
    gpu_memory_gib: 16,
  },
  {
    type: 'g5.xlarge',
    gpu_model: 'NVIDIA A10G',
    gpu_count: 1,
    vcpu: 4,
    memory_gib: 16,
    gpu_memory_gib: 24,
  },
  {
    type: 'g5.2xlarge',
    gpu_model: 'NVIDIA A10G',
    gpu_count: 1,
    vcpu: 8,
    memory_gib: 32,
    gpu_memory_gib: 24,
  },
  {
    type: 'g5.12xlarge',
    gpu_model: 'NVIDIA A10G',
    gpu_count: 4,
    vcpu: 48,
    memory_gib: 192,
    gpu_memory_gib: 96,
  },
  {
    type: 'p4d.24xlarge',
    gpu_model: 'NVIDIA A100',
    gpu_count: 8,
    vcpu: 96,
    memory_gib: 1152,
    gpu_memory_gib: 320,
  },
];

export const AZURE_EASTUS: CatalogInstance[] = [
  { type: 'Standard_B2s', vcpu: 2, memory_gib: 4 },
  { type: 'Standard_D2s_v5', vcpu: 2, memory_gib: 8 },
  { type: 'Standard_D4s_v5', vcpu: 4, memory_gib: 16 },
  { type: 'Standard_D8s_v5', vcpu: 8, memory_gib: 32 },
];

export const AZURE_GPU_EASTUS: GpuCatalogInstance[] = [
  {
    type: 'Standard_NC4as_T4_v3',
    gpu_model: 'NVIDIA T4',
    gpu_count: 1,
    vcpu: 4,
    memory_gib: 28,
    gpu_memory_gib: 16,
  },
  {
    type: 'Standard_NC8as_T4_v3',
    gpu_model: 'NVIDIA T4',
    gpu_count: 1,
    vcpu: 8,
    memory_gib: 56,
    gpu_memory_gib: 16,
  },
  {
    type: 'Standard_NC24ads_A100_v4',
    gpu_model: 'NVIDIA A100',
    gpu_count: 1,
    vcpu: 24,
    memory_gib: 220,
    gpu_memory_gib: 80,
  },
];

export const GCP_US_CENTRAL1: CatalogInstance[] = [
  { type: 'e2-medium', vcpu: 2, memory_gib: 4 },
  { type: 'e2-standard-2', vcpu: 2, memory_gib: 8 },
  { type: 'e2-standard-4', vcpu: 4, memory_gib: 16 },
  { type: 'e2-standard-8', vcpu: 8, memory_gib: 32 },
];

export const GCP_GPU_US_CENTRAL1: GpuCatalogInstance[] = [
  {
    type: 'g2-standard-4',
    gpu_model: 'NVIDIA L4',
    gpu_count: 1,
    vcpu: 4,
    memory_gib: 16,
    gpu_memory_gib: 24,
  },
  {
    type: 'g2-standard-8',
    gpu_model: 'NVIDIA L4',
    gpu_count: 1,
    vcpu: 8,
    memory_gib: 32,
    gpu_memory_gib: 24,
  },
  {
    type: 'a2-highgpu-1g',
    gpu_model: 'NVIDIA A100',
    gpu_count: 1,
    vcpu: 12,
    memory_gib: 85,
    gpu_memory_gib: 40,
  },
];

export const HETZNER_FSN1: CatalogInstance[] = [
  { type: 'cx22', vcpu: 2, memory_gib: 4 },
  { type: 'cx32', vcpu: 4, memory_gib: 8 },
  { type: 'cx42', vcpu: 8, memory_gib: 16 },
  { type: 'cx52', vcpu: 16, memory_gib: 32 },
];

export const HETZNER_GPU_FSN1: GpuCatalogInstance[] = [
  {
    type: 'gex44',
    gpu_model: 'NVIDIA RTX 4000 SFF Ada',
    gpu_count: 1,
    vcpu: 8,
    memory_gib: 32,
    gpu_memory_gib: 20,
  },
  {
    type: 'gex130',
    gpu_model: 'NVIDIA RTX 6000 Ada',
    gpu_count: 1,
    vcpu: 16,
    memory_gib: 64,
    gpu_memory_gib: 48,
  },
];
