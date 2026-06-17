import { PROVIDER_LABELS } from '../estimator/index';
import type { EstimateResult, MonthlyUsdRange, ProviderId } from '../types';

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtRange(range: MonthlyUsdRange): string {
  if (range.min === range.max) return fmtUsd(range.max);
  return `${fmtUsd(range.min)} – ${fmtUsd(range.max)}`;
}

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

export function formatEstimateText(result: EstimateResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    `Confidence: ${result.confidence.level} (${result.confidence.score}/100)`,
  );
  lines.push(
    `Resources: ${result.totals.cpuCores.toFixed(2)} CPU cores · ${result.totals.memoryGiB.toFixed(2)} GiB memory · ${result.totals.storageGiB.toFixed(1)} GiB storage · ${result.totals.loadBalancerCount} LB(s)`,
  );
  lines.push('');
  lines.push('Provider comparison (planning estimate, USD/mo):');
  lines.push('');

  const nameWidth = Math.max(
    ...result.providers.map((p) => PROVIDER_LABELS[p.provider].length),
    8,
  );
  const header = `${pad('Provider', nameWidth)}  ${pad('Region', 14)}  Total/mo`;
  lines.push(header);
  lines.push('-'.repeat(header.length + 12));

  for (const p of result.providers) {
    const label = PROVIDER_LABELS[p.provider as ProviderId];
    lines.push(
      `${pad(label, nameWidth)}  ${pad(p.region, 14)}  ${fmtRange(p.totalMonthlyUsdRange)}`,
    );
  }

  lines.push('');
  for (const p of result.providers) {
    lines.push(`${PROVIDER_LABELS[p.provider as ProviderId]} (${p.region})`);
    lines.push(`  Pricing as of ${p.asOf} · ${p.nodeCount} node(s) at floor`);
    for (const item of p.lineItems) {
      const amount = item.monthlyUsdRange
        ? fmtRange(item.monthlyUsdRange)
        : fmtUsd(item.monthlyUsd);
      lines.push(`  ${item.label}: ${amount}`);
    }
    lines.push('');
  }

  if (result.workloads.length > 0) {
    lines.push('Workloads (compute only):');
    for (const w of result.workloads) {
      const ref = `${w.namespace}/${w.kind}/${w.name}`;
      const ranges = Object.entries(w.computeMonthlyUsdRange)
        .map(([prov, r]) => `${prov} ${fmtRange(r!)}`)
        .join(', ');
      lines.push(
        `  ${ref} ×${w.replicas} — ${w.cpuCores.toFixed(2)} CPU, ${w.memoryGiB.toFixed(2)} GiB — ${ranges}`,
      );
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of result.warnings) {
      const where = w.resource ? ` [${w.resource}]` : '';
      lines.push(`  ${w.severity.toUpperCase()} ${w.id}${where}: ${w.message}`);
    }
    lines.push('');
  }

  lines.push(
    'Planning estimate only — not an invoice. Excludes egress, NAT, Spot/reserved discounts.',
  );

  return lines.join('\n');
}

export function formatEstimateJson(result: EstimateResult): string {
  return JSON.stringify(result, null, 2);
}

const PR_COMMENT_MARKER = '<!-- podmonkey-cost-estimate -->';

export function formatEstimateMarkdown(
  result: EstimateResult,
  opts?: { path?: string },
): string {
  const lines: string[] = [PR_COMMENT_MARKER, ''];

  lines.push('## 🐒 Podmonkey cost estimate');
  if (opts?.path) {
    lines.push(`Path: \`${opts.path}\``);
  }
  lines.push('');
  lines.push(
    `**Confidence:** ${result.confidence.level} (${result.confidence.score}/100)`,
  );
  lines.push(
    `**Resources:** ${result.totals.cpuCores.toFixed(2)} CPU cores · ${result.totals.memoryGiB.toFixed(2)} GiB memory · ${result.totals.storageGiB.toFixed(1)} GiB storage · ${result.totals.loadBalancerCount} load balancer(s)`,
  );
  lines.push('');
  lines.push('### Provider comparison (USD/mo, planning estimate)');
  lines.push('');
  lines.push('| Provider | Region | Total/mo |');
  lines.push('|----------|--------|----------|');

  for (const p of result.providers) {
    const label = PROVIDER_LABELS[p.provider as ProviderId];
    lines.push(
      `| ${label} | ${p.region} | ${fmtRange(p.totalMonthlyUsdRange)} |`,
    );
  }

  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Line items</summary>');
  lines.push('');

  for (const p of result.providers) {
    lines.push(`**${PROVIDER_LABELS[p.provider as ProviderId]}** (${p.region}, as of ${p.asOf})`);
    for (const item of p.lineItems) {
      const amount = item.monthlyUsdRange
        ? fmtRange(item.monthlyUsdRange)
        : fmtUsd(item.monthlyUsd);
      lines.push(`- ${item.label}: ${amount}`);
    }
    lines.push('');
  }

  lines.push('</details>');

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('### Warnings');
    lines.push('');
    for (const w of result.warnings) {
      const icon = w.severity === 'warning' ? '⚠️' : 'ℹ️';
      const where = w.resource ? ` \`${w.resource}\`` : '';
      lines.push(`- ${icon} **${w.id}**${where}: ${w.message}`);
    }
  }

  lines.push('');
  lines.push(
    '_Planning estimate only — not an invoice. Based on resource requests, on-demand rates, 730 h/mo. Excludes egress, NAT, and Spot/reserved discounts. [Methodology](https://github.com/MarketMadi/podmonkey/blob/main/docs/CALCULATION_PLAN.md)_',
  );

  return lines.join('\n');
}

export { PR_COMMENT_MARKER };
