import type { EstimateResult } from '../types';
import { computeEstimateDiff, type EstimateDiff } from './diff';

export interface PolicyOptions {
  /** Fail when any provider's max monthly total exceeds this. */
  maxMonthlyUsd?: number;
  /** Fail when confidence score is below this (0–100). */
  minConfidence?: number;
  /** Fail when max total increase vs base exceeds this (requires diff). */
  maxMonthlyIncreaseUsd?: number;
}

export interface PolicyViolation {
  code: string;
  message: string;
}

export function checkPolicy(
  result: EstimateResult,
  options: PolicyOptions,
  diff?: EstimateDiff,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (options.maxMonthlyUsd !== undefined) {
    for (const p of result.providers) {
      if (p.totalMonthlyUsdRange.max > options.maxMonthlyUsd) {
        violations.push({
          code: 'MAX_MONTHLY_USD',
          message: `${p.provider} total ${p.totalMonthlyUsdRange.max.toFixed(2)} USD/mo exceeds limit ${options.maxMonthlyUsd}`,
        });
      }
    }
  }

  if (
    options.minConfidence !== undefined &&
    result.confidence.score < options.minConfidence
  ) {
    violations.push({
      code: 'MIN_CONFIDENCE',
      message: `Confidence ${result.confidence.score}/100 is below minimum ${options.minConfidence}`,
    });
  }

  if (options.maxMonthlyIncreaseUsd !== undefined) {
    if (!diff) {
      violations.push({
        code: 'DIFF_REQUIRED',
        message: '--base is required when using --max-monthly-increase-usd',
      });
    } else if (diff.maxIncreaseUsd > options.maxMonthlyIncreaseUsd) {
      violations.push({
        code: 'MAX_MONTHLY_INCREASE',
        message: `Monthly increase up to +$${diff.maxIncreaseUsd.toFixed(2)} exceeds limit $${options.maxMonthlyIncreaseUsd}`,
      });
    }
  }

  return violations;
}

export { computeEstimateDiff };
