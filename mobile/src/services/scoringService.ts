import type { Question } from '../models';
import type { AttemptAnswer } from '../models/attempt';

/**
 * The engine's only source of "is this answer correct" logic. Ports the
 * exact grading semantics documented in docs/MOBILE_MIGRATION_AUDIT.md §E
 * (verified against the live web app's `gradeAnswer()`), unchanged:
 *
 *  - single: exact label match.
 *  - sata: exact-set match — the chosen label set must equal the correct
 *    label set exactly (order-independent). Partial credit does not exist.
 *  - numeric: `|value - correctValue| <= tolerance`, i.e. the tolerance
 *    band is inclusive at both ends.
 *
 * Kept framework-agnostic (no React, no storage) so it's trivially unit
 * testable and reusable by the exam engine (M7) without dragging in any
 * QBank-specific code.
 */

export function isAnswerable(question: Question, answer: AttemptAnswer): boolean {
  if (answer.type === 'single') return answer.label.length > 0;
  if (answer.type === 'sata') return answer.labels.length > 0;
  // numeric
  const trimmed = answer.text.trim();
  return trimmed.length > 0 && !Number.isNaN(Number(trimmed));
}

export function scoreQuestion(question: Question, answer: AttemptAnswer): boolean {
  if (question.type === 'single' && answer.type === 'single') {
    return scoreSingle(question.correctLabel, answer.label);
  }
  if (question.type === 'sata' && answer.type === 'sata') {
    return scoreSata(question.correctLabels, answer.labels);
  }
  if (question.type === 'numeric' && answer.type === 'numeric') {
    return scoreNumeric(question.correctValue, question.tolerance, answer.text);
  }
  // A mismatched answer/question type shape is a caller bug, not a valid
  // "incorrect" grading outcome — but scoring must never throw mid-session,
  // so it degrades to "incorrect" rather than crashing the engine.
  return false;
}

export function scoreSingle(correctLabel: string, chosenLabel: string): boolean {
  if (!chosenLabel) return false;
  return chosenLabel === correctLabel;
}

export function scoreSata(correctLabels: string[], chosenLabels: string[]): boolean {
  if (chosenLabels.length === 0) return false;
  const correctSet = [...correctLabels].sort();
  const chosenSet = [...chosenLabels].sort();
  return (
    correctSet.length === chosenSet.length && correctSet.every((label, i) => label === chosenSet[i])
  );
}

export function scoreNumeric(correctValue: number, tolerance: number, rawText: string): boolean {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return false;
  const value = Number(trimmed);
  if (Number.isNaN(value)) return false;
  return Math.abs(value - correctValue) <= tolerance;
}
