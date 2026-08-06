import { progressRepository } from './progressRepository';
import { contentRepository } from './contentRepository';

describe('progressRepository (M3 stub — real totals, honest zeros)', () => {
  test('lessonsTotal/questionsTotal are real, derived from contentRepository', () => {
    const progress = progressRepository.getSystemProgress('cardio');
    expect(progress.lessonsTotal).toBe(contentRepository.getLessonsForSystem('cardio').length);
    expect(progress.questionsTotal).toBe(
      contentRepository.getQuestions({ systemKey: 'cardio' }).length
    );
    expect(progress.lessonsTotal).toBeGreaterThan(0);
    expect(progress.questionsTotal).toBeGreaterThan(0);
  });

  test('tracked progress is honestly zero/null until M6 lands', () => {
    const progress = progressRepository.getSystemProgress('cardio');
    expect(progress.lessonsCompleted).toBe(0);
    expect(progress.questionsAnswered).toBe(0);
    expect(progress.accuracyPct).toBeNull();
  });

  test('works for the synthesized drug-class-study-guide bucket too (no lessons, has questions)', () => {
    const progress = progressRepository.getSystemProgress('drug-class-study-guide');
    expect(progress.lessonsTotal).toBe(0);
    expect(progress.questionsTotal).toBe(99);
  });
});

describe('contentRepository.getDomainDistribution', () => {
  test('sums to the system\'s total question count', () => {
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
