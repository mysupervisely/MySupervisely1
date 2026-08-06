import { contentRepository } from './contentRepository';

describe('contentRepository — content statistics (M2 validation requirement)', () => {
  test('26 real systems + 1 synthesized bucket, 8 anatomical', () => {
    const all = contentRepository.getAllSystems();
    expect(all.filter((s) => s.source === 'content-export')).toHaveLength(26);
    expect(all.filter((s) => s.source === 'synthesized')).toHaveLength(1);
    expect(contentRepository.getAnatomicalSystems()).toHaveLength(8);
  });

  test('101 lessons total, each resolvable to a real system', () => {
    const all = contentRepository.getAllSystems();
    const totalLessons = all.reduce((sum, s) => sum + contentRepository.getLessonsForSystem(s.key).length, 0);
    expect(totalLessons).toBe(101);
  });

  test('2,000 QBank questions with the exact type and domain split from the audit', () => {
    const all = contentRepository.getQuestions();
    expect(all).toHaveLength(2000);
    expect(all.filter((q) => q.type === 'single')).toHaveLength(1883);
    expect(all.filter((q) => q.type === 'numeric')).toHaveLength(115);
    expect(all.filter((q) => q.type === 'sata')).toHaveLength(2);
    expect(all.filter((q) => q.domain === 1)).toHaveLength(500);
    expect(all.filter((q) => q.domain === 2)).toHaveLength(500);
    expect(all.filter((q) => q.domain === 3)).toHaveLength(800);
    expect(all.filter((q) => q.domain === 4)).toHaveLength(100);
    expect(all.filter((q) => q.domain === 5)).toHaveLength(100);
  });

  test('3 exams of 225 questions each, 675 total, all resolvable by exam number', () => {
    const exams = contentRepository.getAllExams();
    expect(exams).toHaveLength(3);
    for (const examNumber of [1, 2, 3] as const) {
      const exam = contentRepository.getExam(examNumber);
      expect(exam?.questions).toHaveLength(225);
    }
    const total = exams.reduce((sum, e) => sum + e.questions.length, 0);
    expect(total).toBe(675);
  });

  test('the Infectious Disease mismatch is resolved: "Infectious Disease" QBank questions resolve to the "id" system', () => {
    const idQuestions = contentRepository.getQuestions({ systemKey: 'id' });
    expect(idQuestions.length).toBeGreaterThan(0);
    expect(idQuestions.every((q) => q.topicLabel === 'Infectious Disease')).toBe(true);
    // The system's own label is left exactly as authored — NOT rewritten to match topicLabel.
    expect(contentRepository.getSystem('id')?.label).toBe('Infectious Disease & Immunology');
  });

  test('"Drug Class Study Guide" questions resolve to the synthesized bucket, not dropped', () => {
    const drugClassQuestions = contentRepository.getQuestions({ systemKey: 'drug-class-study-guide' });
    expect(drugClassQuestions).toHaveLength(99);
    expect(contentRepository.getSystem('drug-class-study-guide')?.source).toBe('synthesized');
  });

  test('SATA questions preserve options + correctLabels (plural, exact-set grading metadata)', () => {
    const sataQuestions = contentRepository.getQuestions({ type: 'sata' });
    expect(sataQuestions).toHaveLength(2);
    for (const q of sataQuestions) {
      if (q.type !== 'sata') throw new Error('expected sata');
      expect(q.correctLabels.length).toBeGreaterThan(0);
      expect(q.options.length).toBeGreaterThan(0);
    }
  });

  test('numeric questions preserve correctValue + tolerance metadata', () => {
    const numericQuestions = contentRepository.getQuestions({ type: 'numeric' });
    expect(numericQuestions).toHaveLength(115);
    for (const q of numericQuestions) {
      if (q.type !== 'numeric') throw new Error('expected numeric');
      expect(typeof q.correctValue).toBe('number');
      expect(typeof q.tolerance).toBe('number');
      expect(q.tolerance).toBeGreaterThanOrEqual(0);
    }
  });

  test('question IDs are stable and unique across the full QBank', () => {
    const all = contentRepository.getQuestions();
    const ids = new Set(all.map((q) => q.id));
    expect(ids.size).toBe(all.length);
  });

  test('getQuestionById / getLesson / getSystem round-trip', () => {
    const q = contentRepository.getQuestions()[0];
    expect(contentRepository.getQuestionById(q.id)).toEqual(q);

    const system = contentRepository.getAllSystems()[0];
    expect(contentRepository.getSystem(system.key)).toEqual(system);

    const lessons = contentRepository.getLessonsForSystem('cardio');
    expect(lessons.length).toBeGreaterThan(0);
    expect(contentRepository.getLesson(lessons[0].id)).toEqual(lessons[0]);
  });
});
