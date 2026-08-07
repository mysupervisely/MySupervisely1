import { API_BASE_URL } from './apiConfig';
import { accessConfig } from '../constants/accessConfig';

/**
 * M9 — typed client for the existing `check-access.mts` and
 * `verify-session.mts` Netlify functions only (docs/
 * MOBILE_PAYMENT_ARCHITECTURE.md §2). Same "API communication only, no
 * business logic, no storage" split as `aiQuestionService.ts` (M8) —
 * `accessService.ts` is where entitlement decisions/caching happen.
 */

export type AccessClientErrorKind = 'network' | 'timeout' | 'backend' | 'malformed';

export type AccessClientError = {
  kind: AccessClientErrorKind;
  message: string;
};

export type CheckAccessResult = { ok: true; valid: boolean } | { ok: false; error: AccessClientError };
export type VerifySessionResult =
  | { ok: true; valid: boolean; token?: string }
  | { ok: false; error: AccessClientError };

function fail<T>(kind: AccessClientErrorKind, message: string): { ok: false; error: AccessClientError } & T {
  return { ok: false, error: { kind, message } } as { ok: false; error: AccessClientError } & T;
}

type FetchLike = typeof fetch;

export type AccessClientConfig = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

async function fetchJson(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; error: AccessClientError }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'GET', signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout', message: 'The request took too long. Check your connection and try again.' } };
    }
    return { ok: false, error: { kind: 'network', message: 'No connection to the access service. Check your network and try again.' } };
  } finally {
    clearTimeout(timeoutId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: { kind: 'malformed', message: "The access service's response could not be read. Please try again." } };
  }

  if (!response.ok) {
    const backendMessage =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : undefined;
    return { ok: false, error: { kind: 'backend', message: backendMessage ?? 'The access service could not complete this request. Please try again.' } };
  }

  return { ok: true, status: response.status, body };
}

export function createAccessClient(config: AccessClientConfig = {}) {
  const baseUrl = config.baseUrl ?? API_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? accessConfig.REQUEST_TIMEOUT_MS;

  return {
    /** GET /api/check-access?token= — "is this token currently known/valid." */
    async checkAccess(token: string): Promise<CheckAccessResult> {
      const result = await fetchJson(`${baseUrl}/api/check-access?token=${encodeURIComponent(token)}`, fetchImpl, timeoutMs);
      if (!result.ok) return fail(result.error.kind, result.error.message);
      const body = result.body;
      if (typeof body !== 'object' || body === null || typeof (body as { valid?: unknown }).valid !== 'boolean') {
        return fail('malformed', "The access service's response was missing required data. Please try again.");
      }
      return { ok: true, valid: (body as { valid: boolean }).valid };
    },

    /** GET /api/verify-session?session_id= — confirms a Stripe checkout session and mints/reuses an access token. */
    async verifySession(sessionId: string): Promise<VerifySessionResult> {
      const result = await fetchJson(`${baseUrl}/api/verify-session?session_id=${encodeURIComponent(sessionId)}`, fetchImpl, timeoutMs);
      if (!result.ok) return fail(result.error.kind, result.error.message);
      const body = result.body;
      if (typeof body !== 'object' || body === null || typeof (body as { valid?: unknown }).valid !== 'boolean') {
        return fail('malformed', "The access service's response was missing required data. Please try again.");
      }
      const typedBody = body as { valid: boolean; token?: unknown };
      const token = typeof typedBody.token === 'string' ? typedBody.token : undefined;
      return { ok: true, valid: typedBody.valid, token };
    },
  };
}

export const accessClient = createAccessClient();
export type AccessClient = ReturnType<typeof createAccessClient>;
