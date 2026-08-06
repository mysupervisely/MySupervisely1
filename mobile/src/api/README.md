# api/

Typed clients for the existing PharmDPrepped Netlify functions. Not implemented in M1.

- `generateQuestionClient` (M9) — calls `POST /api/generate-question` only. Never calls
  Anthropic directly from the client (audit §I).
- `accessClient` (M10) — wraps `GET /api/check-access` and `GET /api/verify-session`.
- `checkoutClient` (M10) — thin service abstraction in front of `POST /api/create-checkout`;
  the real purchase flow on mobile goes through platform IAP, not this endpoint directly (audit
  §P) — this client exists for parity/testing and any future web-initiated entitlement checks.

See `docs/MOBILE_MIGRATION_AUDIT.md` §G for the exact existing contracts these must match.
