/**
 * M9 — the local entitlement record and the states derived from it.
 * `plan` and `expiresAt` are optional because today's real
 * `check-access.mts`/`verify-session.mts` never return them (see
 * docs/MOBILE_PAYMENT_ARCHITECTURE.md §3) — a valid token today means
 * "entitled to everything gated," with no way to know which plan or
 * until when. Both fields are typed and handled correctly now so the
 * exact same client code starts enforcing plan/expiry the moment the
 * backend adds them, with no reshaping later.
 */

export type AccessPlan = 'course' | 'qbank' | 'bundle';

export type AccessRecord = {
  token: string;
  plan?: AccessPlan;
  /** ISO timestamp. Undefined = never expires against what the backend tells us today. */
  expiresAt?: string;
  /** ISO timestamp of the last successful network verification of this token. */
  verifiedAt: string;
};

export type AccessState =
  | { status: 'none' }
  | { status: 'granted'; record: AccessRecord; source: 'network' | 'cache' }
  | { status: 'expired'; record: AccessRecord }
  /** Cached, not expired, but too old to trust while the backend is unreachable — see accessConfig.MAX_OFFLINE_TRUST_MS. */
  | { status: 'stale'; record: AccessRecord };
