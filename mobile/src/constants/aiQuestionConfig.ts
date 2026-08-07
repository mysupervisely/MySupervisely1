/**
 * M8 — named configuration for the AI question-generation integration.
 * Nothing that governs request/cache behavior is a magic number inline
 * in the service/storage files, same discipline as
 * src/constants/analyticsConfig.ts.
 */

export const aiQuestionConfig = {
  /**
   * Client-side request timeout. The backend proxies to Anthropic and has
   * no documented SLA of its own (audit §G) — this is a client-side
   * safety net, not a value the backend enforces or is told about.
   */
  REQUEST_TIMEOUT_MS: 30_000,

  /** Forwarded as `max_tokens` in the request body — generous enough for one stem + 4 options + a rationale, per the audit's confirmed real prompt/response shape. */
  MAX_TOKENS: 1000,

  /**
   * How many recently generated questions to keep in the local cache.
   * Oldest-first eviction once this is exceeded — "recently generated,"
   * not an unbounded permanent archive (AI questions are ephemeral,
   * never committed content — see aiQuestionCacheStorage.ts).
   */
  CACHE_MAX_ENTRIES: 50,
} as const;
