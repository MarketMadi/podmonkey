import { readFileSync, writeFileSync } from 'node:fs';
import { catalogPath } from './load';
import { assertValidModelCatalog } from './validate';
import type { ModelCatalog } from './types';

export function refreshModelCatalogTimestamps(catalog: ModelCatalog): ModelCatalog {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...catalog,
    as_of: today,
    fetched_at: new Date().toISOString(),
  };
}

export function runCatalogRefresh(): { path: string; as_of: string } {
  const path = catalogPath();
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as ModelCatalog;
  const updated = refreshModelCatalogTimestamps(catalog);
  assertValidModelCatalog(updated);
  writeFileSync(path, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return { path, as_of: updated.as_of };
}
