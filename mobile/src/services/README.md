# services/

Business-logic services, repository-pattern, no UI. Not implemented in M1.

Planned: `contentRepository` (M2), `scoringService` (M5, ports the exact grading semantics in
`docs/MOBILE_MIGRATION_AUDIT.md` §E — tolerance-inclusive numeric, exact-set SATA,
answered-not-total exam percentage), `examEngine` state machine (M7), `progressAnalyticsService`
(M6/M8), `pricingService` (M10, ports `Price(days) = base × days^0.425`).
