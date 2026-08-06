import { progressRepository } from './progressRepository';
import { contentRepository } from './contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';

const cardioQuestions = contentRepository.getQuestions({ systemKey: 'cardio' });

beforeEach(async () => {
  await attemptsStorage.clearAll();
});

describe('progressRepository (M4 — real attempt-backed data)', () => {
  test('lessonsTotal/questionsTotal are real, derived from contentRepository', async () => {
    const progress = await progressRepository.getSystemProgress('cardio');
    expect(progress.lessonsTotal).toBe(contentRepository.getLessonsForSystem('cardio').length);
    expect(progress.questionsTotal).toBe(cardioQuestions.length);
    expect(progress.lessonsTotal).toBeGreaterThan(0);
    expect(progress.questionsTotal).toBeGreaterThan(0);
  });

  test('with no attempts recorded, tracked progress is honestly zero/null', async () => {
    const progress = await progressRepository.getSystemProgress('cardio');
    expect(progress.lessonsCompleted).toBe(0);
    expect(progress.questionsAnswered).toBe(0);
    expect(progress.accuracyPct).toBeNull();
  });

  test('questionsAnswered and accuracy reflect real recorded attempts', async () => {
    const [q1, q2, q3] = cardioQuestions;
    await attemptsStorage.recordAttempt({ question: q1, answer: { type: 'single', label: 'A' }, isCorrect: true });
    await attemptsStorage.recordAttempt({ question: q2, answer: { type: 'single', label: 'A' }, isCorrect: true });
    await attemptsStorage.recordAttempt({ question: q3, answer: { type: 'single', label: 'A' }, isCorrect: false });

    const progress = await progressRepository.getSystemProgress('cardio');
    expect(progress.questionsAnswered).toBe(3);
    expect(progress.accuracyPct).toBe(67); // 2/3 correct, rounded
  });

  test('accuracy reflects the MOST RECENT attempt per question, not a lifetime average', async () => {
    const [q1] = cardioQuestions;
    await attemptsStorage.recordAttempt({ question: q1, answer: { type: 'single', label: 'wrong' }, isCorrect: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await attemptsStorage.recordAttempt({ question: q1, answer: { type: 'single', label: 'right' }, isCorrect: true });

    const progress = await progressRepository.getSystemProgress('cardio');
    expect(progress.questionsAnswered).toBe(1); // one unique question, not two attempts
    expect(progress.accuracyPct).toBe(100); // scored on the latest attempt only
  });

  test('attempts on a different system do not leak into this system\'s progress', async () => {
    const [renalQuestion] = contentRepository.getQuestions({ systemKey: 'renal' });
    await attemptsStorage.recordAttempt({
      question: renalQuestion,
      answer: { type: 'single', label: 'A' },
      isCorrect: true,
    });

    const cardioProgress = await progressRepository.getSystemProgress('cardio');
    expect(cardioProgress.questionsAnswered).toBe(0);
  });

  test('works for the synthesized drug-class-study-guide bucket too (no lessons, has questions)', async () => {
    const progress = await progressRepository.getSystemProgress('drug-class-study-guide');
    expect(progress.lessonsTotal).toBe(0);
    expect(progress.questionsTotal).toBe(99);
  });
});

describe('contentRepository.getDomainDistribution', () => {
  test("sums to the system's total question count", () => {
    const total = contentRepository.getQuestions({ systemKey: 'cardio' }).length;
    const distribution = contentRepository.getDomainDistribution('cardio');
    const sum = Object.values(distribution).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBe(total);
  });

  test('every domain key present is within 1-5', () => {
    const distribution = contentRepository.getDomainDistribution('calc');
    for (const domain of Object.keys(distribution)) {
      expect(Number(domain)).toBeGreaterThanOrEqual(1);
      expect(Number(domain)).toBeLessThanOrEqual(5);
    }
  });
});
