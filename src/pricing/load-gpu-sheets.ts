import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GpuPriceSheet, ProviderId } from '../types';

const PACKAGE_ROOT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

const GPU_SHEET_FILES: Partial<Record<ProviderId, string>> = {
  aws: 'aws-us-east-1.json',
  azure: 'azure-eastus.json',
  gcp: 'gcp-us-central1.json',
  hetzner: 'hetzner-fsn1.json',
};

export function gpuPricingDir(customDir?: string): string {
  return customDir ?? join(PACKAGE_ROOT, 'pricing', 'gpu');
}

export function loadGpuPriceSheet(
  provider: ProviderId,
  dir?: string,
): GpuPriceSheet {
  const file = GPU_SHEET_FILES[provider];
  if (!file) {
    throw new Error(`No GPU sheet mapping for provider ${provider}`);
  }
  const path = join(gpuPricingDir(dir), file);
  return JSON.parse(readFileSync(path, 'utf8')) as GpuPriceSheet;
}

export function loadAllGpuPriceSheets(dir?: string): GpuPriceSheet[] {
  const base = gpuPricingDir(dir);
  return readdirSync(base)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(base, f), 'utf8')) as GpuPriceSheet);
}

export function listAvailableGpuSheets(dir?: string): ProviderId[] {
  const base = gpuPricingDir(dir);
  const files = new Set(readdirSync(base));
  return (Object.keys(GPU_SHEET_FILES) as ProviderId[]).filter((p) => {
    const file = GPU_SHEET_FILES[p];
    return file != null && files.has(file);
  });
}
