/**
 * Content import: reads the raw source-of-truth files from
 * mobile-source/content-export/, transforms them into the normalized,
 * typed shape in src/models/, validates the result (scripts/validate-content.ts),
 * and — only if validation passes — writes the output to
 * src/content/generated/*.json, which the app actually ships with.
 *
 * Run: `npm run import:content`
 *
 * This is a one-time/on-demand build step, not something the app runs at
 * runtime. Re-run it whenever mobile-source/content-export/ changes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { TOPIC_LABEL_TO_SYSTEM_KEY, SYNTHESIZED_SYSTEM_KEY } from '../src/content/topicLabelMap';
import { validateContent, type ContentBundle } from './validate-content';
import type {
  RawExamBankFile,
  RawQbankFile,
  RawQuestion,
  RawSystemsFile,
} from './rawTypes';
import type { Exam, ExamNumber, Lesson, Question, System } from '../src/models';

const CONTENT_EXPORT_DIR = resolve(__dirname, '../../mobile-source/content-export');
const OUTPUT_DIR = resolve(__dirname, '../src/content/generated');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function resolveSystemKey(topicLabel: string): string {
  const key = TOPIC_LABEL_TO_SYSTEM_KEY[topicLabel];
  if (!key) {
    throw new Error(
      `Unmapped topicLabel "${topicLabel}" — add it to src/content/topicLabelMap.ts before importing.`
    );
  }
  return key;
}

function toQuestion(raw: RawQuestion, id: string, source: Question['source']): Question {
  const base = {
    id,
    stem: raw.stem,
    rationale: raw.rationale,
    domain: raw.domain as Question['domain'],
    systemKey: resolveSystemKey(raw.topicLabel),
    topicLabel: raw.topicLabel,
    source,
  };

  if (raw.type === 'single') {
    return {
      ...base,
      type: 'single',
      options: raw.options ?? [],
      correctLabel: raw.correctLabel ?? '',
    };
  }
  if (raw.type === 'sata') {
    return {
      ...base,
      type: 'sata',
      options: raw.options ?? [],
      correctLabels: raw.correctLabels ?? [],
    };
  }
  // numeric
  return {
    ...base,
    type: 'numeric',
    correctValue: raw.correctValue ?? NaN,
    tolerance: raw.tolerance ?? 0,
    unit: raw.unit,
  };
}

function importSystemsAndLessons(): { systems: System[]; lessons: Lesson[] } {
  const raw = readJson<RawSystemsFile>(resolve(CONTENT_EXPORT_DIR, 'systems.json'));
  const systems: System[] = [];
  const lessons: Lesson[] = [];

  for (const [key, s] of Object.entries(raw)) {
    const isAnatomical = typeof s.x === 'number' && typeof s.y === 'number';
    systems.push({
      key,
      label: s.label,
      description: s.description,
      quizBrief: s.quizBrief,
      isAnatomical,
      x: isAnatomical ? s.x : undefined,
      y: isAnatomical ? s.y : undefined,
      chip: s.chip ?? false,
      available: s.available,
      lessonIds: s.lessons.map((_, i) => `${key}-lesson-${i}`),
      source: 'content-export',
    });

    s.lessons.forEach((l, i) => {
      lessons.push({
        id: `${key}-lesson-${i}`,
        systemKey: key,
        order: i,
        title: l.title,
        note: l.note,
      });
    });
  }

  // Synthesized bucket for the 99 real "Drug Class Study Guide" QBank
  // questions, which have no home in systems.json (audit §C). Not real
  // content-export data — flagged via `source: 'synthesized'`. No lessons:
  // it's a QBank-only reference topic, not a lesson-bearing system.
  systems.push({
    key: SYNTHESIZED_SYSTEM_KEY,
    label: 'Drug Class Study Guide',
    description:
      'Cross-system drug-class quick-reference questions (mechanism, side effects, black box warnings, monitoring) — not tied to a single body system.',
    isAnatomical: false,
    chip: true,
    available: true,
    lessonIds: [],
    source: 'synthesized',
  });

  return { systems, lessons };
}

function importQbank(): Question[] {
  const raw = readJson<RawQbankFile>(resolve(CONTENT_EXPORT_DIR, 'qbank_questions.json'));
  return raw.map((q, index) => toQuestion(q, `qbank-${index}`, { kind: 'qbank', index }));
}

function importExams(): Exam[] {
  const raw = readJson<RawExamBankFile>(resolve(CONTENT_EXPORT_DIR, 'exam_question_bank.json'));
  const exams: Exam[] = [];

  for (const [examNumStr, slots] of Object.entries(raw)) {
    const examNumber = Number(examNumStr) as ExamNumber;
    // Preserve slot order 0..224 exactly by index, not by iterating
    // Object.entries — and pre-size the array so a missing slot leaves a
    // real hole at its own position (for the validator to report the
    // correct slot number) rather than silently compacting the array and
    // shifting every later slot down by one.
    const slotCount = Object.keys(slots).length;
    const questions: (Question | undefined)[] = new Array(slotCount).fill(undefined);
    for (let slot = 0; slot < slotCount; slot++) {
      const rawQuestion = slots[String(slot)];
      if (!rawQuestion) continue; // hole left in place for validateContent to catch
      questions[slot] = toQuestion(rawQuestion, `exam-${examNumber}-${slot}`, {
        kind: 'exam',
        examNumber,
        slot,
      });
    }
    // Cast: the array may contain holes at this point by construction above.
    // validateContent() runtime-checks each slot regardless of this
    // compile-time type and fails the import if any hole survives.
    exams.push({ examNumber, questions: questions as Question[] });
  }

  return exams.sort((a, b) => a.examNumber - b.examNumber);
}

function main() {
  console.log('Importing PharmDPrepped content from mobile-source/content-export...\n');

  const { systems, lessons } = importSystemsAndLessons();
  const qbank = importQbank();
  const exams = importExams();

  const bundle: ContentBundle = { systems, lessons, qbank, exams };

  console.log('Validating imported content...');
  const result = validateContent(bundle);

  if (result.warnings.length > 0) {
    console.warn(`\n${result.warnings.length} warning(s):`);
    result.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    console.error(`\n${result.errors.length} error(s) — import ABORTED, nothing written:`);
    result.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, 'systems.json'), JSON.stringify(systems, null, 2));
  writeFileSync(resolve(OUTPUT_DIR, 'lessons.json'), JSON.stringify(lessons, null, 2));
  writeFileSync(resolve(OUTPUT_DIR, 'qbank.json'), JSON.stringify(qbank));
  writeFileSync(resolve(OUTPUT_DIR, 'exams.json'), JSON.stringify(exams));

  const meta = {
    generatedAt: new Date().toISOString(),
    counts: {
      systems: systems.length,
      anatomicalSystems: systems.filter((s) => s.isAnatomical).length,
      lessons: lessons.length,
      qbank: qbank.length,
      qbankByType: countBy(qbank, (q) => q.type),
      qbankByDomain: countBy(qbank, (q) => String(q.domain)),
      exams: exams.map((e) => ({
        examNumber: e.examNumber,
        questionCount: e.questions.length,
        byType: countBy(e.questions, (q) => q.type),
        byDomain: countBy(e.questions, (q) => String(q.domain)),
      })),
    },
  };
  writeFileSync(resolve(OUTPUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log('\nContent validation passed. Wrote:');
  console.log(`  systems.json  (${systems.length} systems, ${lessons.length} lessons)`);
  console.log(`  qbank.json    (${qbank.length} questions)`);
  console.log(`  exams.json    (${exams.length} exams)`);
  console.log(`  meta.json`);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

main();
