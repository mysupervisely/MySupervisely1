/**
 * Question domain model. Discriminated union on `type`, matching the three
 * question types the real content actually uses (audit §C/D): single-answer,
 * numeric/calculation, and select-all-that-apply (SATA).
 *
 * Every field the raw source carries is preserved — nothing is dropped in
 * normalization. In particular:
 *  - SATA questions keep `options` + `correctLabels` (plural, exact-set
 *    grading — see docs/MOBILE_MIGRATION_AUDIT.md §E).
 *  - Numeric questions keep `correctValue`, `tolerance`, and `unit` — the
 *    metadata the tolerance-inclusive scoring rule in M5 depends on.
 */

export type QuestionOption = {
  label: string;
  text: string;
};

export type QuestionDomain = 1 | 2 | 3 | 4 | 5;

/** Where a question came from — kept for debugging/traceability, not shown to users. */
export type QuestionSource =
  | { kind: 'qbank'; index: number }
  | { kind: 'exam'; examNumber: 1 | 2 | 3; slot: number }
  /** M8 addition — AI-generated via generate-question.mts, never committed content (no index/slot to speak of). `generatedAt` is an ISO timestamp, for the same debugging/traceability purpose as the other two variants. */
  | { kind: 'ai'; generatedAt: string };

type QuestionBase = {
  id: string;
  /** Real stem text, verbatim from the content export — never edited. */
  stem: string;
  /** Real rationale text, verbatim from the content export — never edited. */
  rationale: string;
  domain: QuestionDomain;
  /**
   * Resolved system key (see src/content/topicLabelMap.ts) — always a valid
   * key into the systems collection, including the synthesized
   * 'drug-class-study-guide' bucket. Resolved explicitly at import time, not
   * inferred by string-matching `topicLabel` against a system's `label`.
   */
  systemKey: string;
  /** Original topicLabel string from the source content, preserved verbatim. */
  topicLabel: string;
  source: QuestionSource;
};

export type SingleAnswerQuestion = QuestionBase & {
  type: 'single';
  options: QuestionOption[];
  correctLabel: string;
};

export type NumericQuestion = QuestionBase & {
  type: 'numeric';
  correctValue: number;
  tolerance: number;
  unit?: string;
};

export type SataQuestion = QuestionBase & {
  type: 'sata';
  options: QuestionOption[];
  correctLabels: string[];
};

export type Question = SingleAnswerQuestion | NumericQuestion | SataQuestion;
