/**
 * M9 — named configuration for the access/entitlement layer, same
 * discipline as analyticsConfig.ts/aiQuestionConfig.ts.
 */

export const accessConfig = {
  /** Client-side request timeout for accessClient calls — the backend has no documented SLA of its own. */
  REQUEST_TIMEOUT_MS: 15_000,

  /**
   * How long a cached, previously-verified entitlement is trusted while
   * the backend is unreachable (offline, or the backend itself is down).
   * Past this window, an unreachable-backend refresh no longer silently
   * grants access from a stale cache — see accessService.ts's `stale`
   * state. Generous (a week) since punishing a briefly-offline paying
   * student is worse than a week of trust either direction.
   */
  MAX_OFFLINE_TRUST_MS: 7 * 24 * 60 * 60 * 1000,
} as const;
