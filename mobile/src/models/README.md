# models/

Domain TypeScript types (M2+). Not implemented in M1 beyond navigation param types, which live
in `src/navigation/types.ts` since they're navigation-specific, not domain models.

Planned for M2 onward: `Question` (discriminated union on `type: 'single' | 'numeric' | 'sata'`),
`System`, `Lesson`, `Exam`, `ExamProgress`, `Attempt`, `AccessToken`, `PricingPlan` — see
`docs/MOBILE_MIGRATION_AUDIT.md` §Q for the intended shapes.
