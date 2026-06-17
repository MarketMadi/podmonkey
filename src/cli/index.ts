import { parseArgs } from 'node:util';
import type { ProviderId } from '../types';
import {
  formatEstimateJson,
  formatEstimateMarkdown,
  formatEstimateText,
} from './format';
import { readYamlInput, runEstimate } from './run-estimate';

const PROVIDERS = new Set<ProviderId>(['aws', 'gcp', 'azure', 'hetzner']);

function printHelp(): void {
  process.stdout.write(`podmonkey — Kubernetes manifest cost estimator

Usage:
  podmonkey estimate [options]

Commands:
  estimate          Estimate monthly cost from Kubernetes YAML

Options:
  -f, --file <path>   YAML file or directory, or "-" for stdin (required)
  --json              Output JSON instead of text
  --markdown          Output Markdown (for PR comments)
  --provider <id>     Limit to one provider (aws|gcp|azure|hetzner); repeatable
  --aks-tier <tier>   AKS control plane: free (default) or standard
  --no-gke-free       Charge GKE control plane (disable free zonal tier)
  --min-nodes <n>     Minimum nodes for node-floor model (default: 1)
  -h, --help          Show help
  -v, --version       Show version

Examples:
  podmonkey estimate -f examples/nginx-deployment.yaml
  podmonkey estimate -f - --json < manifests.yaml
  kubectl get deploy,svc -o yaml | podmonkey estimate -f -
  podmonkey estimate -f app.yaml --provider aws --provider hetzner
`);
}

function parseProviders(values: string[] | undefined): ProviderId[] | undefined {
  if (!values?.length) return undefined;
  const out: ProviderId[] = [];
  for (const v of values) {
    if (!PROVIDERS.has(v as ProviderId)) {
      throw new Error(`Unknown provider "${v}". Use: aws, gcp, azure, hetzner`);
    }
    out.push(v as ProviderId);
  }
  return out;
}

function estimateCommand(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      file: { type: 'string', short: 'f' },
      json: { type: 'boolean', default: false },
      markdown: { type: 'boolean', default: false },
      provider: { type: 'string', multiple: true },
      'aks-tier': { type: 'string' },
      'no-gke-free': { type: 'boolean', default: false },
      'min-nodes': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.json && values.markdown) {
    process.stderr.write('Error: use only one of --json or --markdown\n');
    return 1;
  }

  if (!values.file) {
    process.stderr.write('Error: --file (-f) is required\n\n');
    printHelp();
    return 1;
  }

  const aksTier = values['aks-tier'];
  if (aksTier && aksTier !== 'free' && aksTier !== 'standard') {
    process.stderr.write('Error: --aks-tier must be "free" or "standard"\n');
    return 1;
  }

  const minNodes = values['min-nodes']
    ? Number.parseInt(values['min-nodes'], 10)
    : 1;
  if (!Number.isFinite(minNodes) || minNodes < 1) {
    process.stderr.write('Error: --min-nodes must be a positive integer\n');
    return 1;
  }

  let yaml: string;
  try {
    yaml = readYamlInput(values.file);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error reading input: ${msg}\n`);
    return 1;
  }

  let providers: ProviderId[] | undefined;
  try {
    providers = parseProviders(values.provider);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    return 1;
  }

  try {
    const result = runEstimate({
      yaml,
      providers,
      options: {
        gkeFreeTier: !values['no-gke-free'],
        aksTier: (aksTier as 'free' | 'standard') ?? 'free',
        minNodes,
      },
    });

    process.stdout.write(
      values.json
        ? formatEstimateJson(result)
        : values.markdown
          ? formatEstimateMarkdown(result, { path: values.file })
          : formatEstimateText(result),
    );
    if (!values.json && !values.markdown) process.stdout.write('\n');
    return 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    return 1;
  }
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;

  if (!command || command === '-h' || command === '--help') {
    printHelp();
    return 0;
  }

  if (command === '-v' || command === '--version') {
    process.stdout.write('podmonkey 0.1.0\n');
    return 0;
  }

  if (command === 'estimate') {
    return estimateCommand(rest);
  }

  process.stderr.write(`Unknown command: ${command}\n\n`);
  printHelp();
  return 1;
}

const code = main(process.argv.slice(2));
process.exit(code);
