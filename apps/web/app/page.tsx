'use client';

import { useMemo, useState } from 'react';
import { runEstimate, PROVIDER_LABELS } from '../lib/engine';
import { DEFAULT_EXAMPLE, EXAMPLES } from '../lib/examples';
import type { ConfidenceLevel, MonthlyUsdRange, ProviderId } from '../../../src/types';
import styles from './page.module.css';

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
  const [yaml, setYaml] = useState<string>(DEFAULT_EXAMPLE.yaml);
  const { result, error } = useMemo(() => {
    try {
      return { result: runEstimate(yaml), error: null as string | null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : 'Failed to parse YAML',
      };
    }
  }, [yaml]);

  const cheapest = useMemo(() => {
    if (!result?.providers.length) return null;
    return result.providers.reduce((a, b) =>
      a.totalMonthlyUsdRange.max < b.totalMonthlyUsdRange.max ? a : b,
    );
  }, [result]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <span aria-hidden>🐒</span> Podmonkey
          </h1>
          <p className={styles.subtitle}>
            Paste Kubernetes YAML → compare planning-grade monthly estimates
            across clouds.{' '}
            <a
              href="https://github.com/MarketMadi/podmonkey/blob/main/docs/CALCULATION_PLAN.md"
              target="_blank"
              rel="noreferrer"
            >
              How we calculate
            </a>
          </p>
        </div>
        <p className={styles.disclaimer}>
          Planning estimates only — not an invoice. Shows a{' '}
          <strong>range</strong> from resource requests (marginal) to whole-VM
          node floor. Excludes egress, NAT, and Spot discounts.
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.editorPanel}>
          <div className={styles.panelHeader}>
            <h2>Manifests</h2>
            <div className={styles.panelActions}>
              <select
                className={styles.exampleSelect}
                value=""
                onChange={(e) => {
                  const ex = EXAMPLES.find((x) => x.id === e.target.value);
                  if (ex) setYaml(ex.yaml);
                  e.target.value = '';
                }}
                aria-label="Load example manifest"
              >
                <option value="" disabled>
                  Load example…
                </option>
                {EXAMPLES.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setYaml(DEFAULT_EXAMPLE.yaml)}
              >
                Reset
              </button>
            </div>
          </div>
          <textarea
            className={styles.textarea}
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            spellCheck={false}
            aria-label="Kubernetes YAML"
          />
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section className={styles.resultsPanel}>
          {result && (
            <>
              <div
                className={styles.confidence}
                data-level={result.confidence.level}
              >
                <strong>{CONFIDENCE_LABEL[result.confidence.level]}</strong>
                <span>{result.confidence.score}/100</span>
                {result.confidence.level === 'low' && (
                  <p className={styles.confidenceNote}>
                    Estimate may differ ±50%+ from an actual bill — add resource
                    requests to improve accuracy.
                  </p>
                )}
              </div>

              <div className={styles.totals}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Total CPU requested</span>
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
                    cheapest?.provider === p.provider &&
                    result.providers.length > 1;
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
                      {isCheapest && (
                        <span className={styles.badge}>Lowest</span>
                      )}
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
                        Pricing as of {p.asOf} · {p.nodeCount} node
                        {p.nodeCount !== 1 ? 's' : ''} (floor)
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
                          <th>Namespace</th>
                          <th>Kind</th>
                          <th>Name</th>
                          <th>Replicas</th>
                          <th>CPU</th>
                          <th>Memory</th>
                          <th>Compute $/mo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.workloads.map((w) => (
                          <tr key={`${w.namespace}/${w.kind}/${w.name}`}>
                            <td>{w.namespace}</td>
                            <td>{w.kind}</td>
                            <td className={styles.monoCell}>{w.name}</td>
                            <td>{w.replicas}</td>
                            <td>{w.cpuCores.toFixed(2)}</td>
                            <td>{w.memoryGiB.toFixed(2)} GiB</td>
                            <td>
                              {formatProviderRange(w.computeMonthlyUsdRange)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.tableNote}>
                    Compute range = marginal requests .. node floor (excludes
                    control plane, storage, load balancers).
                  </p>
                </>
              )}

              {result.warnings.length > 0 && (
                <>
                  <h2 className={styles.sectionTitle}>Warnings</h2>
                  <ul className={styles.warnings}>
                    {result.warnings.map((w, i) => (
                      <li
                        key={`${w.id}-${i}`}
                        data-severity={w.severity}
                        className={styles.warning}
                      >
                        <strong>{w.id}</strong>
                        {w.resource && (
                          <code className={styles.resource}>{w.resource}</code>
                        )}
                        <span>{w.message}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
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
