# api/

Typed clients for the existing PharmDPrepped Netlify functions.

- `apiConfig.ts` — `API_BASE_URL`, the absolute origin every client here calls against (the
  mobile app is a separate bundle from the Netlify site, unlike its own same-origin relative
  `fetch('/api/...')` calls). **Not yet set to a real deployed origin** — see
  `docs/M8_IMPLEMENTATION_NOTES.md` "Base URL."
- `aiQuestionService.ts` (M8) — calls `POST /api/generate-question` only (audit §I). Builds the
  prompt, calls the one real endpoint, parses/validates the response into a `Question`. Never
  calls Anthropic directly, never touches an API key. See
  `docs/M8_IMPLEMENTATION_NOTES.md` for the full request/response contract and error handling.
- `accessClient` (M10, not yet built) — will wrap `GET /api/check-access` and
  `GET /api/verify-session`.
- `checkoutClient` (M10, not yet built) — thin service abstraction in front of
  `POST /api/create-checkout`; the real purchase flow on mobile goes through platform IAP, not
  this endpoint directly (audit §P) — this client exists for parity/testing and any future
  web-initiated entitlement checks.

See `docs/MOBILE_MIGRATION_AUDIT.md` §G for the exact existing contracts these must match.
