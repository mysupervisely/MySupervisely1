# models/

Domain TypeScript types (M2).

- `question.ts` — `Question` discriminated union on `type: 'single' | 'numeric' | 'sata'`,
  plus `SingleAnswerQuestion`/`NumericQuestion`/`SataQuestion`/`QuestionOption`. Every field the
  raw source carries is preserved — SATA's `correctLabels` (plural, exact-set grading) and
  numeric's `correctValue`/`tolerance`/`unit` are not dropped in normalization.
- `system.ts` — `System`, with `isAnatomical` derived from the presence of real `x`/`y`
  coordinates (not hand-copied from a flag).
- `lesson.ts` — `Lesson`, metadata-only by design (see the file's doc comment for why).
- `exam.ts` — `Exam`, `ExamNumber`.

Still planned for later milestones: `ExamProgress`/`Attempt` (M6/M7), `AccessToken`/`PricingPlan`
(M10) — not needed yet since M2 doesn't touch storage or payments.
