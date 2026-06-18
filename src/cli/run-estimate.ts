import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { estimate } from '../estimator/index';
import { parseManifests } from '../parser/index';
import { loadPriceSheet, loadPriceSheets } from '../pricing/load-sheets';
import type {
  EstimateOptions,
  EstimateResult,
  ProviderId,
  PriceSheet,
} from '../types';

export interface RunEstimateInput {
  yaml: string;
  providers?: ProviderId[];
  pricingDir?: string;
  options?: EstimateOptions;
}

function walkYamlFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkYamlFiles(full));
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function readYamlInput(file: string): string {
  if (file === '-') {
    return readFileSync(0, 'utf8');
  }

  const stat = statSync(file);
  if (stat.isDirectory()) {
    const files = walkYamlFiles(file);
    if (files.length === 0) {
      throw new Error(`No YAML files found in directory: ${file}`);
    }
    return files
      .sort()
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n---\n');
  }

  return readFileSync(file, 'utf8');
}

export function runEstimate(input: RunEstimateInput): EstimateResult {
  const sheets =
    input.providers && input.providers.length > 0
      ? input.providers.map((p) => loadPriceSheet(p, input.pricingDir))
      : loadPriceSheets(undefined, input.pricingDir);

  const defaults = sheets[0]?.defaults;
  if (!defaults) {
    throw new Error('No price sheets loaded');
  }

  const parseDefaults = {
    ...defaults,
    ...(input.options?.daemonsetNodeCount !== undefined && {
      daemonset_node_count: input.options.daemonsetNodeCount,
    }),
  };

  const parsed = parseManifests(input.yaml, parseDefaults);
  return estimate(parsed, sheets, input.options);
}

export { loadPriceSheets, loadPriceSheet };
export type { EstimateResult, PriceSheet };
