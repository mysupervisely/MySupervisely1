/**
 * Automated content validation. Exported as a pure function so
 * import-content.ts can call it before writing output (fail the import, not
 * just the app later), and so it can also run standalone against the
 * already-generated bundle under src/content/generated/ — e.g. in CI,
 * where mobile-source/ may not even be checked out.
 *
 * Run standalone: `npm run validate:content`
 *
 * Every check here is a hard error (fails the build) unless explicitly
 * marked as a warning. This is the mechanism referenced in
 * docs/M2_IMPLEMENTATION_NOTES.md as "the build fails if...".
 */
import type { Exam, Lesson, Question, System } from '../src/models';

export type ContentBundle = {
  systems: System[];
  lessons: Lesson[];
  qbank: Question[];
  exams: Exam[];
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

const EXPECTED_QBANK_TOTAL = 2000;
const EXPECTED_QBANK_TYPE_COUNTS = { single: 1883, numeric: 115, sata: 2 } as const;
const EXPECTED_QBANK_DOMAIN_COUNTS = { 1: 500, 2: 500, 3: 800, 4: 100, 5: 100 } as const;

const EXPECTED_EXAM_NUMBERS = [1, 2, 3] as const;
const EXPECTED_EXAM_QUESTION_COUNT = 225;
const EXPECTED_EXAM_DOMAIN_COUNTS = { 1: 56, 2: 56, 3: 91, 4: 11, 5: 11 } as const;

const EXPECTED_SYSTEM_COUNT_FROM_SOURCE = 26;
const EXPECTED_ANATOMICAL_SYSTEM_COUNT = 8;
const EXPECTED_LESSON_COUNT = 101;

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

export function validateContent(bundle: ContentBundle): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const systemKeys = new Set(bundle.systems.map((s) => s.key));

  // ---- Systems ----
  const sourceSystems = bundle.systems.filter((s) => s.source === 'content-export');
  if (sourceSystems.length !== EXPECTED_SYSTEM_COUNT_FROM_SOURCE) {
    errors.push(
      `Expected ${EXPECTED_SYSTEM_COUNT_FROM_SOURCE} systems from content-export, got ${sourceSystems.length}`
    );
  }
  const anatomicalCount = bundle.systems.filter((s) => s.isAnatomical).length;
  if (anatomicalCount !== EXPECTED_ANATOMICAL_SYSTEM_COUNT) {
    errors.push(
      `Expected ${EXPECTED_ANATOMICAL_SYSTEM_COUNT} anatomical (body-map) systems, got ${anatomicalCount}`
    );
  }
  for (const system of bundle.systems) {
    if (!system.key) errors.push('System with empty key');
    if (!system.label) errors.push(`System '${system.key}' has empty label`);
    if (system.isAnatomical) {
      if (typeof system.x !== 'number' || typeof system.y !== 'number') {
        errors.push(`Anatomical system '${system.key}' is missing x/y coordinates`);
      }
    }
  }
  const dupeSystemKeys = findDuplicates(bundle.systems.map((s) => s.key));
  if (dupeSystemKeys.length > 0) {
    errors.push(`Duplicate system keys: ${dupeSystemKeys.join(', ')}`);
  }

  // ---- Lessons ----
  if (bundle.lessons.length !== EXPECTED_LESSON_COUNT) {
    errors.push(`Expected ${EXPECTED_LESSON_COUNT} lessons, got ${bundle.lessons.length}`);
  }
  for (const lesson of bundle.lessons) {
    if (!lesson.title) errors.push(`Lesson '${lesson.id}' has empty title`);
    if (!lesson.note) errors.push(`Lesson '${lesson.id}' has empty note`);
    // "lessons reference unknown systems" check
    if (!systemKeys.has(lesson.systemKey)) {
      errors.push(`Lesson '${lesson.id}' references unknown system '${lesson.systemKey}'`);
    }
  }
  const dupeLessonIds = findDuplicates(bundle.lessons.map((l) => l.id));
  if (dupeLessonIds.length > 0) {
    errors.push(`Duplicate lesson IDs: ${dupeLessonIds.join(', ')}`);
  }

  // ---- QBank ----
  if (bundle.qbank.length !== EXPECTED_QBANK_TOTAL) {
    errors.push(`Expected ${EXPECTED_QBANK_TOTAL} QBank questions, got ${bundle.qbank.length}`);
  }
  validateQuestionSet(bundle.qbank, systemKeys, errors, 'QBank');

  const qbankTypeCounts = countByType(bundle.qbank);
  for (const [type, expected] of Object.entries(EXPECTED_QBANK_TYPE_COUNTS)) {
    const actual = qbankTypeCounts[type] ?? 0;
    if (actual !== expected) {
      errors.push(`QBank type '${type}': expected ${expected}, got ${actual}`);
    }
  }
  const qbankDomainCounts = countByDomain(bundle.qbank);
  for (const [domain, expected] of Object.entries(EXPECTED_QBANK_DOMAIN_COUNTS)) {
    const actual = qbankDomainCounts[Number(domain)] ?? 0;
    if (actual !== expected) {
      errors.push(`QBank domain ${domain}: expected ${expected}, got ${actual}`);
    }
  }
  const dupeQbankIds = findDuplicates(bundle.qbank.map((q) => q.id));
  if (dupeQbankIds.length > 0) {
    errors.push(`Duplicate QBank question IDs: ${dupeQbankIds.slice(0, 10).join(', ')}`);
  }

  // ---- Exams ----
  const examNumbers = bundle.exams.map((e) => e.examNumber).sort();
  if (JSON.stringify(examNumbers) !== JSON.stringify([...EXPECTED_EXAM_NUMBERS])) {
    errors.push(`Expected exams numbered ${EXPECTED_EXAM_NUMBERS.join(',')}, got ${examNumbers.join(',')}`);
  }
  const allExamQuestionIds: string[] = [];
  for (const exam of bundle.exams) {
    // "exams reference missing questions" check — every one of the 225
    // slots must be present and non-null; a gap means a slot silently
    // failed to import.
    if (exam.questions.length !== EXPECTED_EXAM_QUESTION_COUNT) {
      errors.push(
        `Exam ${exam.examNumber}: expected ${EXPECTED_EXAM_QUESTION_COUNT} questions, got ${exam.questions.length}`
      );
    }
    exam.questions.forEach((q, slot) => {
      if (!q) {
        errors.push(`Exam ${exam.examNumber} slot ${slot} is missing a question`);
      }
    });
    validateQuestionSet(exam.questions, systemKeys, errors, `Exam ${exam.examNumber}`);

    const domainCounts = countByDomain(exam.questions);
    for (const [domain, expected] of Object.entries(EXPECTED_EXAM_DOMAIN_COUNTS)) {
      const actual = domainCounts[Number(domain)] ?? 0;
      if (actual !== expected) {
        errors.push(`Exam ${exam.examNumber} domain ${domain}: expected ${expected}, got ${actual}`);
      }
    }
    allExamQuestionIds.push(...exam.questions.filter(Boolean).map((q) => q.id));
  }
  const dupeExamIds = findDuplicates(allExamQuestionIds);
  if (dupeExamIds.length > 0) {
    errors.push(`Duplicate exam question IDs (across all exams): ${dupeExamIds.slice(0, 10).join(', ')}`);
  }

  // ---- Cross-collection ID collisions ----
  const qbankIdSet = new Set(bundle.qbank.map((q) => q.id));
  const crossCollisions = allExamQuestionIds.filter((id) => qbankIdSet.has(id));
  if (crossCollisions.length > 0) {
    errors.push(`Question IDs shared between QBank and exams: ${crossCollisions.slice(0, 10).join(', ')}`);
  }

  return { errors, warnings };
}

function validateQuestionSet(
  questions: Question[],
  systemKeys: Set<string>,
  errors: string[],
  label: string
): void {
  for (const q of questions) {
    if (!q) continue; // already reported as a missing-slot error where applicable
    if (!q.id) errors.push(`${label}: question with empty id`);
    if (!q.stem) errors.push(`${label} question '${q.id}': empty stem`);
    if (!q.rationale) errors.push(`${label} question '${q.id}': empty rationale`);
    // "questions reference unknown systems" check
    if (!systemKeys.has(q.systemKey)) {
      errors.push(`${label} question '${q.id}': references unknown system '${q.systemKey}'`);
    }

    if (q.type === 'single') {
      if (!q.options || q.options.length === 0) {
        errors.push(`${label} question '${q.id}' (single): no options`);
      } else if (!q.options.some((o) => o.label === q.correctLabel)) {
        errors.push(`${label} question '${q.id}' (single): correctLabel '${q.correctLabel}' not among options`);
      }
    } else if (q.type === 'sata') {
      if (!q.options || q.options.length === 0) {
        errors.push(`${label} question '${q.id}' (sata): no options`);
      }
      if (!q.correctLabels || q.correctLabels.length === 0) {
        errors.push(`${label} question '${q.id}' (sata): empty correctLabels`);
      } else {
        const optionLabels = new Set((q.options ?? []).map((o) => o.label));
        for (const cl of q.correctLabels) {
          if (!optionLabels.has(cl)) {
            errors.push(`${label} question '${q.id}' (sata): correctLabel '${cl}' not among options`);
          }
        }
      }
    } else if (q.type === 'numeric') {
      if (typeof q.correctValue !== 'number' || Number.isNaN(q.correctValue)) {
        errors.push(`${label} question '${q.id}' (numeric): invalid correctValue`);
      }
      if (typeof q.tolerance !== 'number' || Number.isNaN(q.tolerance) || q.tolerance < 0) {
        errors.push(`${label} question '${q.id}' (numeric): invalid tolerance`);
      }
    }
  }
}

// Both counters skip falsy entries defensively — a missing exam slot
// (see the "exams reference missing questions" check above) is already
// reported there; it shouldn't also crash the domain/type tallies.
function countByType(questions: Question[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of questions) {
    if (!q) continue;
    counts[q.type] = (counts[q.type] ?? 0) + 1;
  }
  return counts;
}

function countByDomain(questions: Question[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const q of questions) {
    if (!q) continue;
    counts[q.domain] = (counts[q.domain] ?? 0) + 1;
  }
  return counts;
}

// ---- CLI entry point: validate the already-generated bundle on disk ----
async function main() {
  const systems = (await import('../src/content/generated/systems.json')).default as unknown as System[];
  const lessons = (await import('../src/content/generated/lessons.json')).default as unknown as Lesson[];
  const qbank = (await import('../src/content/generated/qbank.json')).default as unknown as Question[];
  const exams = (await import('../src/content/generated/exams.json')).default as unknown as Exam[];

  const result = validateContent({ systems, lessons, qbank, exams });

  if (result.warnings.length > 0) {
    console.warn(`\n${result.warnings.length} warning(s):`);
    result.warnings.forEach((w) => console.warn(`  - ${w}`));
  }
  if (result.errors.length > 0) {
    console.error(`\n${result.errors.length} error(s):`);
    result.errors.forEach((e) => console.error(`  - ${e}`));
    console.error('\nContent validation FAILED.');
    process.exit(1);
  }
  console.log('Content validation passed: 0 errors' + (result.warnings.length ? `, ${result.warnings.length} warning(s)` : '.'));
}

// Only run the CLI entry point when this file is executed directly (not when imported by import-content.ts).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
