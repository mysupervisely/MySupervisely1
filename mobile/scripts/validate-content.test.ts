import { validateContent, type ContentBundle } from './validate-content';
import type { Exam, Lesson, Question, System } from '../src/models';
import realSystems from '../src/content/generated/systems.json';
import realLessons from '../src/content/generated/lessons.json';
import realQbank from '../src/content/generated/qbank.json';
import realExams from '../src/content/generated/exams.json';

/**
 * These tests exist to prove the "build fails if..." claim in
 * docs/M2_IMPLEMENTATION_NOTES.md is real: each failure category the task
 * asked for is deliberately triggered against a synthetic bundle and must
 * produce a matching error. If any of these ever pass without an error,
 * validateContent() has regressed silently.
 */

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'qbank-0',
    stem: 'stem',
    rationale: 'rationale',
    domain: 1,
    systemKey: 'cardio',
    topicLabel: 'Cardiovascular',
    source: { kind: 'qbank', index: 0 },
    type: 'single',
    options: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
    ],
    correctLabel: 'A',
    ...overrides,
  } as Question;
}

function makeMinimalValidBundle(): ContentBundle {
  const system: System = {
    key: 'cardio',
    label: 'Cardiovascular',
    description: 'desc',
    isAnatomical: true,
    x: 1,
    y: 1,
    chip: false,
    available: true,
    lessonIds: ['cardio-lesson-0'],
    source: 'content-export',
  };
  const lesson: Lesson = {
    id: 'cardio-lesson-0',
    systemKey: 'cardio',
    order: 0,
    title: 'Title',
    note: 'Note',
  };
  const exam: Exam = {
    examNumber: 1,
    questions: [makeQuestion({ id: 'exam-1-0', source: { kind: 'exam', examNumber: 1, slot: 0 } })],
  };
  return {
    systems: [system],
    lessons: [lesson],
    qbank: [makeQuestion()],
    exams: [exam],
  };
}

describe('validateContent — failure categories the task requires', () => {
  test('flags a question that references an unknown system', () => {
    const bundle = makeMinimalValidBundle();
    bundle.qbank[0] = makeQuestion({ systemKey: 'does-not-exist' });
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('unknown system'))).toBe(true);
  });

  test('flags an exam that is missing a question at a given slot', () => {
    const bundle = makeMinimalValidBundle();
    const exam = bundle.exams[0];
    exam.questions = [
      makeQuestion({ id: 'exam-1-0' }),
      undefined as unknown as Question, // simulated hole, matching how import-content.ts can leave one
    ];
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('slot 1') && e.includes('missing'))).toBe(true);
  });

  test('flags a lesson that references an unknown system', () => {
    const bundle = makeMinimalValidBundle();
    bundle.lessons[0] = { ...bundle.lessons[0], systemKey: 'ghost-system' };
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('references unknown system'))).toBe(true);
  });

  test('flags duplicate QBank question IDs', () => {
    const bundle = makeMinimalValidBundle();
    bundle.qbank = [makeQuestion({ id: 'dup' }), makeQuestion({ id: 'dup' })];
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('Duplicate QBank question IDs'))).toBe(true);
  });

  test('flags duplicate exam question IDs across exams', () => {
    const bundle = makeMinimalValidBundle();
    bundle.exams = [
      { examNumber: 1, questions: [makeQuestion({ id: 'exam-dup' })] },
      { examNumber: 2, questions: [makeQuestion({ id: 'exam-dup' })] },
    ];
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('Duplicate exam question IDs'))).toBe(true);
  });

  test('flags duplicate system keys', () => {
    const bundle = makeMinimalValidBundle();
    bundle.systems = [bundle.systems[0], { ...bundle.systems[0] }];
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('Duplicate system keys'))).toBe(true);
  });

  test('flags a SATA correctLabels entry not present among its own options', () => {
    const bundle = makeMinimalValidBundle();
    bundle.qbank[0] = makeQuestion({
      type: 'sata',
      options: [{ label: 'A', text: 'a' }],
      correctLabels: ['Z'],
    });
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes("correctLabel 'Z' not among options"))).toBe(true);
  });

  test('flags a numeric question with a negative tolerance', () => {
    const bundle = makeMinimalValidBundle();
    bundle.qbank[0] = makeQuestion({
      type: 'numeric',
      correctValue: 5,
      tolerance: -1,
    });
    const result = validateContent(bundle);
    expect(result.errors.some((e) => e.includes('invalid tolerance'))).toBe(true);
  });

  test('a genuinely valid minimal bundle still fails on the aggregate count checks (expected — these are QBank-scale invariants)', () => {
    // Sanity check that the minimal fixture isn't accidentally "valid" by
    // the full-scale count rules (2000 QBank questions, 26 systems, etc.)
    // — it SHOULD report count mismatches, just not structural errors.
    const result = validateContent(makeMinimalValidBundle());
    expect(result.errors.some((e) => e.includes('Expected 2000 QBank questions'))).toBe(true);
    expect(result.errors.some((e) => e.includes('unknown system'))).toBe(false);
  });
});

describe('validateContent — the real generated content bundle', () => {
  test('passes with zero errors', () => {
    const bundle: ContentBundle = {
      systems: realSystems as unknown as System[],
      lessons: realLessons as unknown as Lesson[],
      qbank: realQbank as unknown as Question[],
      exams: realExams as unknown as Exam[],
    };
    const result = validateContent(bundle);
    expect(result.errors).toEqual([]);
  });
});
