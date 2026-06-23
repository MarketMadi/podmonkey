import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultModelCatalog } from './resolve';
import type { ModelCatalog } from './types';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

let cached: ModelCatalog | null = null;

export function catalogPath(): string {
  return join(PACKAGE_ROOT, 'catalog/models.json');
}

export function loadModelCatalog(): ModelCatalog {
  if (cached) return cached;
  const raw = readFileSync(catalogPath(), 'utf8');
  cached = JSON.parse(raw) as ModelCatalog;
  setDefaultModelCatalog(cached);
  return cached;
}

export function clearModelCatalogCache(): void {
  cached = null;
}
