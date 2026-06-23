#!/usr/bin/env node
import { createRefreshContext, refreshAllPricing } from './index.js';

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict');

  console.log(`Podmonkey pricing refresh (strict=${strict})`);
  const ctx = await createRefreshContext(strict);
  console.log(`as_of=${ctx.asOf} EUR/USD=${ctx.eurToUsd}`);

  const results = await refreshAllPricing(ctx);

  if (results.length === 0) {
    console.error('No price sheets updated.');
    process.exit(1);
  }

  for (const result of results) {
    console.log(`updated ${result.path}`);
  }

  console.log(`Done — ${results.length} sheet(s) updated.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
