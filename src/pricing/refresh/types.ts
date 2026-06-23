import type { ProviderId } from '../../types';

export interface RefreshContext {
  /** ISO date (YYYY-MM-DD) stamped on written sheets. */
  asOf: string;
  /** When the refresh run started (ISO 8601). */
  fetchedAt: string;
  eurToUsd: number;
  strict: boolean;
}

export interface RefreshResult {
  provider: ProviderId;
  updated: boolean;
  path: string;
  warnings: string[];
}
