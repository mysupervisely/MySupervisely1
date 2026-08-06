# content/

The typed content layer (M2). Not implemented in M1 — no QBank questions, exam questions, or
lesson data are imported yet.

M2 will:

- Import `mobile-source/content-export/{qbank_questions,exam_question_bank,systems}.json`
  verbatim (no wording/rationale edits — Phase 4) into a normalized, typed bundle here.
- Assign stable synthetic IDs (`qbank-{n}`, `exam-{examNum}-{slot}`) since the source JSON has
  none (audit §L).
- Resolve the `topicLabel` → system-key mapping explicitly (audit §C), including the
  `Infectious Disease` → `id` mismatch and the orphan `Drug Class Study Guide` topic — not by
  naive string matching.
- Expose a `contentRepository` service (in `src/services/`) as the only way screens read
  content — this directory holds data + the loader, not UI-facing logic.
