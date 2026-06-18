import { spawnSync } from 'node:child_process';

export interface HelmTemplateOptions {
  chart: string;
  release?: string;
  namespace?: string;
  values?: string[];
}

export function renderHelmTemplate(opts: HelmTemplateOptions): string {
  const release = opts.release ?? 'release';
  const args = ['template', release, opts.chart];
  if (opts.namespace) {
    args.push('--namespace', opts.namespace);
  }
  for (const valuesFile of opts.values ?? []) {
    args.push('-f', valuesFile);
  }

  const result = spawnSync('helm', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'helm not found in PATH — install Helm or pipe: helm template . | podmonkey estimate -f -',
      );
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || `helm template failed with exit ${result.status}`,
    );
  }

  const yaml = result.stdout?.trim();
  if (!yaml) {
    throw new Error('helm template produced no output');
  }

  return yaml;
}
