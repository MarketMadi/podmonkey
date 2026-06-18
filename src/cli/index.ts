import { parseArgs } from 'node:util';
import type { ProviderId } from '../types';
import { computeEstimateDiff } from './diff';
import {
  formatEstimateMarkdown,
  formatEstimateText,
} from './format';
import { renderHelmTemplate } from './helm';
import { checkPolicy } from './policy';
import { readYamlInput, runEstimate } from './run-estimate';

const VERSION = '0.2.0';
const PROVIDERS = new Set<ProviderId>(['aws', 'gcp', 'azure', 'hetzner']);

function printHelp(): void {
  process.stdout.write(`podmonkey — Kubernetes manifest cost estimator

Usage:
  podmonkey estimate [options]

Commands:
  estimate          Estimate monthly cost from Kubernetes YAML

Options:
  -f, --file <path>              YAML file or directory, or "-" for stdin
  --base <path>                  Compare against base manifests (PR diff)
  --helm-chart <path>            Render a Helm chart (requires helm in PATH)
  --helm-release <name>          Helm release name (default: release)
  --helm-namespace <ns>          Helm namespace
  --helm-values <path>           Helm values file; repeatable
  --json                         Output JSON instead of text
  --markdown                     Output Markdown (for PR comments)
  --provider <id>                Limit to aws|gcp|azure|hetzner; repeatable
  --aks-tier <tier>              AKS control plane: free (default) or standard
  --no-gke-free                  Charge GKE control plane (disable free zonal tier)
  --min-nodes <n>                Minimum nodes for node-floor model (default: 1)
  --max-monthly-usd <n>          Fail (exit 2) if any provider max total exceeds n
  --min-confidence <n>           Fail (exit 2) if confidence score is below n
  --max-monthly-increase-usd <n> Fail (exit 2) if increase vs --base exceeds n
  -h, --help                     Show help
  -v, --version                  Show version

Examples:
  podmonkey estimate -f examples/nginx-deployment.yaml
  podmonkey estimate -f k8s/ --base k8s.main/ --markdown
  helm template myapp ./chart | podmonkey estimate -f -
  podmonkey estimate --helm-chart ./chart --helm-values values.yaml
  podmonkey estimate -f app.yaml --max-monthly-usd 500 --min-confidence 60
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

function parsePositiveNumber(
  label: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return n;
}

function estimateOptions(values: Record<string, unknown>) {
  const aksTier = values['aks-tier'] as string | undefined;
  if (aksTier && aksTier !== 'free' && aksTier !== 'standard') {
    throw new Error('--aks-tier must be "free" or "standard"');
  }

  const minNodes = values['min-nodes']
    ? Number.parseInt(values['min-nodes'] as string, 10)
    : 1;
  if (!Number.isFinite(minNodes) || minNodes < 1) {
    throw new Error('--min-nodes must be a positive integer');
  }

  return {
    gkeFreeTier: !values['no-gke-free'],
    aksTier: (aksTier as 'free' | 'standard') ?? 'free',
    minNodes,
  };
}

function estimateCommand(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      file: { type: 'string', short: 'f' },
      base: { type: 'string' },
      'helm-chart': { type: 'string' },
      'helm-release': { type: 'string' },
      'helm-namespace': { type: 'string' },
      'helm-values': { type: 'string', multiple: true },
      json: { type: 'boolean', default: false },
      markdown: { type: 'boolean', default: false },
      provider: { type: 'string', multiple: true },
      'aks-tier': { type: 'string' },
      'no-gke-free': { type: 'boolean', default: false },
      'min-nodes': { type: 'string' },
      'max-monthly-usd': { type: 'string' },
      'min-confidence': { type: 'string' },
      'max-monthly-increase-usd': { type: 'string' },
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

  if (!values.file && !values['helm-chart']) {
    process.stderr.write('Error: --file (-f) or --helm-chart is required\n\n');
    printHelp();
    return 1;
  }

  let options;
  let providers: ProviderId[] | undefined;
  let policyOpts;
  try {
    options = estimateOptions(values);
    providers = parseProviders(values.provider);
    policyOpts = {
      maxMonthlyUsd: parsePositiveNumber(
        '--max-monthly-usd',
        values['max-monthly-usd'],
      ),
      minConfidence: parsePositiveNumber(
        '--min-confidence',
        values['min-confidence'],
      ),
      maxMonthlyIncreaseUsd: parsePositiveNumber(
        '--max-monthly-increase-usd',
        values['max-monthly-increase-usd'],
      ),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    return 1;
  }

  let yaml: string;
  try {
    if (values['helm-chart']) {
      yaml = renderHelmTemplate({
        chart: values['helm-chart'],
        release: values['helm-release'],
        namespace: values['helm-namespace'],
        values: values['helm-values'],
      });
    } else {
      yaml = readYamlInput(values.file!);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error reading input: ${msg}\n`);
    return 1;
  }

  let baseYaml: string | undefined;
  if (values.base) {
    try {
      baseYaml = readYamlInput(values.base);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`Error reading --base: ${msg}\n`);
      return 1;
    }
  }

  try {
    const runOpts = { yaml, providers, options };
    const result = runEstimate(runOpts);

    let diff: ReturnType<typeof computeEstimateDiff> | undefined;
    if (baseYaml !== undefined) {
      const baseResult = runEstimate({ ...runOpts, yaml: baseYaml });
      diff = computeEstimateDiff(baseResult, result);
    }

    const violations = checkPolicy(result, policyOpts, diff);
    if (violations.length > 0) {
      for (const v of violations) {
        process.stderr.write(`Policy violation [${v.code}]: ${v.message}\n`);
      }
    }

    const formatOpts = { diff, path: values.file ?? values['helm-chart'] };

    if (values.json) {
      const payload = diff ? { ...result, diff } : result;
      process.stdout.write(JSON.stringify(payload, null, 2));
    } else if (values.markdown) {
      process.stdout.write(formatEstimateMarkdown(result, formatOpts));
    } else {
      process.stdout.write(formatEstimateText(result, { diff }));
      if (!values.json && !values.markdown) process.stdout.write('\n');
    }

    if (violations.length > 0) return 2;
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
    process.stdout.write(`podmonkey ${VERSION}\n`);
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
