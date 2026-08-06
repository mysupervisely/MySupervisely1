# services/

Business-logic services, repository pattern, no UI.

- `contentRepository.ts` (M2) — the only way screens read content:
  `getAllSystems()`, `getAnatomicalSystems()`, `getNonAnatomicalSystems()`, `getSystem(key)`,
  `getLessonsForSystem(key)`, `getLesson(id)`, `getQuestions(filter?)`, `getQuestionById(id)`,
  `getExam(examNumber)`, `getAllExams()`. Reads the pre-validated bundle in
  `src/content/generated/`, builds lookup indices once at module load.

Still planned: `scoringService` (M5, ports the exact grading semantics in
`docs/MOBILE_MIGRATION_AUDIT.md` §E), `examEngine` state machine (M7), `progressAnalyticsService`
(M6/M8), `pricingService` (M10).
