import { accessClient } from '../api/accessClient';
import { accessStorage } from '../storage/accessStorage';
import { accessConfig } from '../constants/accessConfig';
import type { AccessClient, AccessClientError } from '../api/accessClient';
import type { AccessPlan, AccessRecord, AccessState } from '../models/access';

/**
 * M9 — the dedicated AccessService: "verify entitlement, cache
 * entitlement, refresh entitlement, expose access state to the UI. Do
 * not scatter entitlement checks throughout screens." This is the ONE
 * place that owns entitlement logic; every screen that needs to gate
 * something calls into this (via useAccessState.ts), never
 * re-implements "is this token valid" or "has this expired" itself.
 *
 * Layering matches the rest of the app: accessClient.ts (API
 * communication only) + accessStorage.ts (persistence only) are
 * composed here into the actual business logic + caching behavior.
 */

// ---- Pure decision functions (exported for direct unit testing) ----

/** Undefined `expiresAt` = never expires against what the backend tells us today (docs/MOBILE_PAYMENT_ARCHITECTURE.md §3). */
export function isExpired(record: AccessRecord, now: Date): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt).getTime() <= now.getTime();
}

/** Has this cached verification aged past the point we're willing to trust it without reaching the network. */
export function isStaleForOffline(record: AccessRecord, now: Date): boolean {
  const verifiedMs = new Date(record.verifiedAt).getTime();
  return now.getTime() - verifiedMs > accessConfig.MAX_OFFLINE_TRUST_MS;
}

/**
 * Undefined `plan` (today's real backend never returns one) grants
 * every plan — the only signal a legacy/current token carries is "valid
 * at all," not which tier. Once the backend adds `plan`, this narrows
 * to an exact/bundle-includes-everything match automatically.
 */
export function grantsPlan(record: AccessRecord, requiredPlan: AccessPlan): boolean {
  if (!record.plan) return true;
  if (record.plan === 'bundle') return true;
  return record.plan === requiredPlan;
}

/** A record that was just confirmed valid (fresh network check, or an as-cached read) — expired takes priority over granted. */
export function computeStateForValidRecord(record: AccessRecord, now: Date, source: 'network' | 'cache'): AccessState {
  if (isExpired(record, now)) return { status: 'expired', record };
  return { status: 'granted', record, source };
}

/** A record whose network re-verification just failed (offline/backend down) — falls back to the cache, bounded by staleness. */
export function computeOfflineFallbackState(record: AccessRecord, now: Date): AccessState {
  if (isExpired(record, now)) return { status: 'expired', record };
  if (isStaleForOffline(record, now)) return { status: 'stale', record };
  return { status: 'granted', record, source: 'cache' };
}

// ---- The composed service ----

export type AccessStorageLike = {
  getRecord(): Promise<AccessRecord | null>;
  setRecord(record: AccessRecord): Promise<void>;
  clear(): Promise<void>;
};

export type AccessServiceConfig = {
  client?: AccessClient;
  storage?: AccessStorageLike;
  now?: () => Date;
};

export type VerifyOutcome = { ok: true; state: AccessState } | { ok: false; error: AccessClientError };

/** Factory (like createAIQuestionService in M8) so tests can inject a mock client/storage/clock. `accessService` below is the real, default-configured instance every screen actually uses. */
export function createAccessService(config: AccessServiceConfig = {}) {
  const client = config.client ?? accessClient;
  const storage = config.storage ?? accessStorage;
  const now = config.now ?? (() => new Date());

  async function verifyToken(token: string): Promise<VerifyOutcome> {
    const result = await client.checkAccess(token);
    if (!result.ok) return { ok: false, error: result.error };

    if (!result.valid) {
      const existing = await storage.getRecord();
      if (existing?.token === token) await storage.clear(); // don't leave a now-invalid token cached as granted
      return { ok: true, state: { status: 'none' } };
    }

    const record: AccessRecord = { token, verifiedAt: now().toISOString() };
    await storage.setRecord(record);
    return { ok: true, state: computeStateForValidRecord(record, now(), 'network') };
  }

  async function redeemStripeSession(sessionId: string): Promise<VerifyOutcome> {
    const result = await client.verifySession(sessionId);
    if (!result.ok) return { ok: false, error: result.error };

    if (!result.valid || !result.token) {
      return { ok: true, state: { status: 'none' } };
    }

    const record: AccessRecord = { token: result.token, verifiedAt: now().toISOString() };
    await storage.setRecord(record);
    return { ok: true, state: computeStateForValidRecord(record, now(), 'network') };
  }

  /** Current state from the cache only — no network call. Used for a fast initial UI render; call `refresh()` to actually re-verify. */
  async function getState(): Promise<AccessState> {
    const record = await storage.getRecord();
    if (!record) return { status: 'none' };
    return computeStateForValidRecord(record, now(), 'cache');
  }

  /** Re-verifies the cached token against the network, falling back to the (bounded) cache if the backend is unreachable. */
  async function refresh(): Promise<AccessState> {
    const record = await storage.getRecord();
    if (!record) return { status: 'none' };

    const result = await client.checkAccess(record.token);
    if (!result.ok) {
      return computeOfflineFallbackState(record, now());
    }
    if (!result.valid) {
      await storage.clear();
      return { status: 'none' };
    }

    const refreshed: AccessRecord = { ...record, verifiedAt: now().toISOString() };
    await storage.setRecord(refreshed);
    return computeStateForValidRecord(refreshed, now(), 'network');
  }

  async function hasAccess(requiredPlan: AccessPlan): Promise<boolean> {
    const state = await getState();
    return state.status === 'granted' && grantsPlan(state.record, requiredPlan);
  }

  async function clearAccess(): Promise<void> {
    await storage.clear();
  }

  return { verifyToken, redeemStripeSession, getState, refresh, hasAccess, clearAccess };
}

export const accessService = createAccessService();
export type AccessServiceInstance = ReturnType<typeof createAccessService>;
