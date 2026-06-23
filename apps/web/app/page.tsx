'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  detectInputMode,
  exportEstimateMarkdown,
  exportInferenceMarkdown,
  runEstimate,
  runInferenceEstimate,
  PROVIDER_LABELS,
  MARKETPLACE_LABELS,
  type InputMode,
} from '../lib/engine';
import type { WebEstimateOptions } from '../lib/engine';
import {
  DEFAULT_INFERENCE_EXAMPLE,
  DEFAULT_K8S_EXAMPLE,
  INFERENCE_EXAMPLES,
  K8S_EXAMPLES,
} from '../lib/examples';
import type {
  ConfidenceLevel,
  MarketplaceProviderId,
  MonthlyUsdRange,
  ProviderId,
} from '../../../src/types';
import styles from './page.module.css';

const DEFAULT_OPTIONS: WebEstimateOptions = {
  gkeFreeTier: true,
  aksTier: 'free',
  daemonsetNodeCount: 3,
  minNodes: 1,
};

function readYamlFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('y=')) return null;
  try {
    return decodeURIComponent(escape(atob(raw.slice(2))));
  } catch {
    return null;
  }
}

function writeYamlToHash(yaml: string): void {
  const encoded = btoa(unescape(encodeURIComponent(yaml)));
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', `${base}#y=${encoded}`);
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatUsdRange(range: MonthlyUsdRange): string {
  if (range.min === range.max) return formatUsd(range.max);
  return `${formatUsd(range.min)}–${formatUsd(range.max)}`;
}

function formatProviderRange(
  ranges: Partial<Record<ProviderId, MonthlyUsdRange>>,
): string {
  const values = Object.values(ranges).filter(
    (v): v is MonthlyUsdRange => v !== undefined,
  );
  if (values.length === 0) return '—';
  const min = Math.min(...values.map((r) => r.min));
  const max = Math.max(...values.map((r) => r.max));
  if (min === max) return formatUsd(max);
  return `${formatUsd(min)}–${formatUsd(max)}`;
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export default function Home() {
  const [mode, setMode] = useState<InputMode>('kubernetes');
  const [k8sYaml, setK8sYaml] = useState<string>(DEFAULT_K8S_EXAMPLE.yaml);
  const [inferenceYaml, setInferenceYaml] = useState<string>(
    DEFAULT_INFERENCE_EXAMPLE.yaml,
  );
  const [options, setOptions] = useState<WebEstimateOptions>(DEFAULT_OPTIONS);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const yaml = mode === 'kubernetes' ? k8sYaml : inferenceYaml;
  const setYaml = mode === 'kubernetes' ? setK8sYaml : setInferenceYaml;

  useEffect(() => {
    const fromHash = readYamlFromHash();
    if (!fromHash) return;
    const detected = detectInputMode(fromHash);
    setMode(detected);
    if (detected === 'inference') setInferenceYaml(fromHash);
    else setK8sYaml(fromHash);
  }, []);

  const k8sResult = useMemo(() => {
    if (mode !== 'kubernetes') return { result: null, error: null as string | null };
    try {
      return { result: runEstimate(k8sYaml, options), error: null as string | null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : 'Failed to parse YAML',
      };
    }
  }, [mode, k8sYaml, options]);

  const inferenceResult = useMemo(() => {
    if (mode !== 'inference') return { result: null, error: null as string | null };
    try {
      return {
        result: runInferenceEstimate(inferenceYaml),
        error: null as string | null,
      };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : 'Failed to parse profile',
      };
    }
  }, [mode, inferenceYaml]);

  const error = mode === 'kubernetes' ? k8sResult.error : inferenceResult.error;

  const copyMarkdown = useCallback(async () => {
    if (mode === 'kubernetes' && k8sResult.result) {
      await navigator.clipboard.writeText(exportEstimateMarkdown(k8sResult.result));
    } else if (mode === 'inference' && inferenceResult.result) {
      await navigator.clipboard.writeText(
        exportInferenceMarkdown(inferenceResult.result),
      );
    } else {
      return;
    }
    setCopyStatus('Copied markdown');
    setTimeout(() => setCopyStatus(null), 2000);
  }, [mode, k8sResult.result, inferenceResult.result]);

  const shareLink = useCallback(() => {
    writeYamlToHash(yaml);
    void navigator.clipboard.writeText(window.location.href);
    setCopyStatus('Share link copied');
    setTimeout(() => setCopyStatus(null), 2000);
  }, [yaml]);

  const cheapestK8s = useMemo(() => {
    if (!k8sResult.result?.providers.length) return null;
    return k8sResult.result.providers.reduce((a, b) =>
      a.totalMonthlyUsdRange.max < b.totalMonthlyUsdRange.max ? a : b,
    );
  }, [k8sResult.result]);

  const cheapestInference = useMemo(() => {
    if (!inferenceResult.result?.providers.length) return null;
    return inferenceResult.result.providers[0];
  }, [inferenceResult.result]);

  const examples = mode === 'kubernetes' ? K8S_EXAMPLES : INFERENCE_EXAMPLES;
  const defaultExample =
    mode === 'kubernetes' ? DEFAULT_K8S_EXAMPLE : DEFAULT_INFERENCE_EXAMPLE;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <span aria-hidden>🐒</span> Podmonkey
          </h1>
          <p className={styles.subtitle}>
            {mode === 'kubernetes'
              ? 'Paste Kubernetes YAML → compare cloud + GPU node costs.'
              : 'Paste an inference profile → compare RunPod, Modal, Lambda, and more.'}
          </p>
        </div>
        <p className={styles.disclaimer}>
          {mode === 'kubernetes'
            ? 'Planning estimates from resource requests and public list prices. GPU workloads use GPU instance node floor when nvidia.com/gpu is set.'
            : 'Serverless = pay per compute-second. Pod = always-on $/hr × workers. Excludes egress, storage, cold starts.'}
        </p>
      </header>

      <div className={styles.modeTabs} role="tablist" aria-label="Input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'kubernetes'}
          className={mode === 'kubernetes' ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode('kubernetes')}
        >
          Kubernetes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'inference'}
          className={mode === 'inference' ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode('inference')}
        >
          GPU inference
        </button>
      </div>

      <main className={styles.main}>
        <section className={styles.editorPanel}>
          <div className={styles.panelHeader}>
            <h2>{mode === 'kubernetes' ? 'Manifests' : 'Inference profile'}</h2>
            <div className={styles.panelActions}>
              <select
                className={styles.exampleSelect}
                value=""
                onChange={(e) => {
                  const ex = examples.find((x) => x.id === e.target.value);
                  if (ex) setYaml(ex.yaml);
                  e.target.value = '';
                }}
                aria-label="Load example"
              >
                <option value="" disabled>
                  Load example…
                </option>
                {examples.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setYaml(defaultExample.yaml)}
              >
                Reset
              </button>
              {(k8sResult.result || inferenceResult.result) && (
                <>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => void copyMarkdown()}
                  >
                    Copy MD
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={shareLink}
                  >
                    Share
                  </button>
                </>
              )}
            </div>
          </div>

          {mode === 'kubernetes' && (
            <div className={styles.settings}>
              <label className={styles.setting}>
                <input
                  type="checkbox"
                  checked={options.gkeFreeTier ?? true}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, gkeFreeTier: e.target.checked }))
                  }
                />
                GKE free tier
              </label>
              <label className={styles.setting}>
                AKS
                <select
                  value={options.aksTier ?? 'free'}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      aksTier: e.target.value as 'free' | 'standard',
                    }))
                  }
                >
                  <option value="free">Free</option>
                  <option value="standard">Standard ($73/mo)</option>
                </select>
              </label>
              <label className={styles.setting}>
                DaemonSet nodes
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={options.daemonsetNodeCount ?? 3}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      daemonsetNodeCount: Number.parseInt(e.target.value, 10) || 3,
                    }))
                  }
                  className={styles.numInput}
                />
              </label>
            </div>
          )}

          {mode === 'inference' && (
            <p className={styles.inputHint}>
              Use <code>kind: InferenceEstimate</code> with{' '}
              <code>spec.model</code> (auto GPU tier) or <code>spec.gpu</code>,{' '}
              <code>requestsPerDay</code>, <code>avgSecondsPerRequest</code>, and{' '}
              <code>billing: serverless|pod</code>.
            </p>
          )}

          {copyStatus && (
            <span className={styles.copyStatus}>{copyStatus}</span>
          )}

          <textarea
            className={styles.textarea}
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            spellCheck={false}
            aria-label={mode === 'kubernetes' ? 'Kubernetes YAML' : 'Inference profile YAML'}
          />
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section className={styles.resultsPanel}>
          {mode === 'kubernetes' && k8sResult.result && (
            <K8sResults result={k8sResult.result} cheapest={cheapestK8s} />
          )}
          {mode === 'inference' && inferenceResult.result && (
            <InferenceResults
              result={inferenceResult.result}
              cheapest={cheapestInference}
            />
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <a href="https://github.com/MarketMadi/podmonkey">GitHub</a>
        <span>·</span>
        <a href="https://opencost.io/docs/specification/">OpenCost spec</a>
        <span>·</span>
        MIT License
      </footer>
    </div>
  );
}

function K8sResults({
  result,
  cheapest,
}: {
  result: NonNullable<ReturnType<typeof runEstimate>>;
  cheapest: ReturnType<typeof runEstimate>['providers'][0] | null;
}) {
  return (
    <>
      <div className={styles.confidence} data-level={result.confidence.level}>
        <strong>{CONFIDENCE_LABEL[result.confidence.level]}</strong>
        <span>{result.confidence.score}/100</span>
      </div>

      <div className={styles.totals}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total CPU</span>
          <span className={styles.statValue}>
            {result.totals.cpuCores.toFixed(2)} cores
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total memory</span>
          <span className={styles.statValue}>
            {result.totals.memoryGiB.toFixed(2)} GiB
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total GPUs</span>
          <span className={styles.statValue}>{result.totals.gpuCount}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Storage (PVCs)</span>
          <span className={styles.statValue}>
            {result.totals.storageGiB.toFixed(1)} GiB
          </span>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Provider comparison</h2>
      <div className={styles.providerGrid}>
        {result.providers.map((p) => {
          const isCheapest =
            cheapest?.provider === p.provider && result.providers.length > 1;
          return (
            <article
              key={p.provider}
              className={`${styles.providerCard} ${isCheapest ? styles.cheapest : ''}`}
            >
              <h3>{PROVIDER_LABELS[p.provider as ProviderId]}</h3>
              <p className={styles.region}>{p.region}</p>
              <p className={styles.price}>
                {formatUsdRange(p.totalMonthlyUsdRange)}
                <span>/mo</span>
              </p>
              {isCheapest && <span className={styles.badge}>Lowest</span>}
              <ul className={styles.lineItems}>
                {p.lineItems.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <span>
                      {item.monthlyUsdRange
                        ? formatUsdRange(item.monthlyUsdRange)
                        : formatUsd(item.monthlyUsd)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.asOf}>
                Pricing as of {p.asOf}
                {p.gpuCount
                  ? ` · ${p.gpuCount} GPU(s) · ${p.gpuInstanceType ?? p.nodeInstanceType}`
                  : ` · ${p.nodeCount} node(s) (floor)`}
              </p>
            </article>
          );
        })}
      </div>

      {result.workloads.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Workloads</h2>
          <div className={styles.tableWrap}>
            <table className={styles.workloadTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Replicas</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>GPUs</th>
                  <th>Compute $/mo</th>
                </tr>
              </thead>
              <tbody>
                {result.workloads.map((w) => (
                  <tr key={`${w.namespace}/${w.kind}/${w.name}`}>
                    <td className={styles.monoCell}>
                      {w.namespace}/{w.name}
                    </td>
                    <td>{w.replicas}</td>
                    <td>{w.cpuCores.toFixed(2)}</td>
                    <td>{w.memoryGiB.toFixed(2)} GiB</td>
                    <td>{w.gpuCount}</td>
                    <td>{formatProviderRange(w.computeMonthlyUsdRange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result.warnings.length > 0 && <WarningsList warnings={result.warnings} />}
    </>
  );
}

function InferenceResults({
  result,
  cheapest,
}: {
  result: NonNullable<ReturnType<typeof runInferenceEstimate>>;
  cheapest: (typeof result.providers)[0] | null;
}) {
  return (
    <>
      {result.model && (
        <div className={styles.modelBanner}>
          <strong>{result.model.label}</strong>
          <span>
            {result.model.quantization} · ~{result.model.totalVramGiB.toFixed(1)} GiB
            VRAM · min tier {result.model.minGpuTier}
          </span>
        </div>
      )}

      <div className={styles.totals}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>GPU tier</span>
          <span className={styles.statValue}>{result.profile.gpu}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Billing</span>
          <span className={styles.statValue}>{result.profile.billing}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Requests / month</span>
          <span className={styles.statValue}>
            {result.totals.requestsPerMonth.toLocaleString()}
          </span>
        </div>
        {result.totals.usdPerMillionTokens != null && (
          <div className={styles.stat}>
            <span className={styles.statLabel}>$/1M tokens</span>
            <span className={styles.statValue}>
              ${result.totals.usdPerMillionTokens.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Marketplace comparison</h2>
      <div className={styles.providerGrid}>
        {result.providers.map((p) => {
          const isCheapest = cheapest?.provider === p.provider;
          return (
            <article
              key={p.provider}
              className={`${styles.providerCard} ${isCheapest ? styles.cheapest : ''}`}
            >
              <h3>{MARKETPLACE_LABELS[p.provider as MarketplaceProviderId]}</h3>
              <p className={styles.region}>{p.matchedTier}</p>
              <p className={styles.price}>
                {formatUsd(p.totalMonthlyUsd)}
                <span>/mo</span>
              </p>
              {isCheapest && result.providers.length > 1 && (
                <span className={styles.badge}>Lowest</span>
              )}
              <ul className={styles.lineItems}>
                {p.lineItems.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <span>{formatUsd(item.monthlyUsd)}</span>
                  </li>
                ))}
                {p.usdPerMillionTokens != null && (
                  <li>
                    <span>$/1M tokens</span>
                    <span>${p.usdPerMillionTokens.toFixed(2)}</span>
                  </li>
                )}
                {p.podBreakEvenRequestsPerDay != null && (
                  <li>
                    <span>Pod break-even</span>
                    <span>{p.podBreakEvenRequestsPerDay.toLocaleString()} req/day</span>
                  </li>
                )}
              </ul>
              <p className={styles.asOf}>Pricing as of {p.asOf}</p>
            </article>
          );
        })}
      </div>

      {result.warnings.length > 0 && <WarningsList warnings={result.warnings} />}
    </>
  );
}

function WarningsList({
  warnings,
}: {
  warnings: Array<{
    id: string;
    severity: string;
    message: string;
    resource?: string;
  }>;
}) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Warnings</h2>
      <ul className={styles.warnings}>
        {warnings.map((w, i) => (
          <li
            key={`${w.id}-${i}`}
            data-severity={w.severity}
            className={styles.warning}
          >
            <strong>{w.id}</strong>
            {w.resource && <code className={styles.resource}>{w.resource}</code>}
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
