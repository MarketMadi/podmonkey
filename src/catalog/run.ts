#!/usr/bin/env tsx
import { loadModelCatalog } from './load.js';
import { runCatalogRefresh } from './refresh.js';
import { assertValidModelCatalog } from './validate.js';

const cmd = process.argv[2] ?? 'validate';

if (cmd === 'validate') {
  const catalog = loadModelCatalog();
  assertValidModelCatalog(catalog);
  console.log(
    `Model catalog OK (${catalog.models.length} models, as_of ${catalog.as_of})`,
  );
} else if (cmd === 'refresh') {
  const { path, as_of } = runCatalogRefresh();
  console.log(`Refreshed ${path} (as_of ${as_of})`);
} else {
  console.error(`Usage: tsx src/catalog/run.ts [validate|refresh]`);
  process.exit(1);
}
