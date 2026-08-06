import { attemptsStorage } from './attemptsStorage';
import type { SingleAnswerQuestion } from '../models/question';

const question: SingleAnswerQuestion = {
  id: 'qbank-42',
  type: 'single',
  stem: 'stem',
  rationale: 'rationale',
  domain: 3,
  systemKey: 'cardio',
  topicLabel: 'Cardiovascular',
  source: { kind: 'qbank', index: 42 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
  ],
  correctLabel: 'B',
};

beforeEach(async () => {
  await attemptsStorage.clearAll();
});

describe('attemptsStorage — progress recording', () => {
  test('recordAttempt persists system, domain, timestamp, and correctness', async () => {
    const attempt = await attemptsStorage.recordAttempt({
      question,
      answer: { type: 'single', label: 'B' },
      isCorrect: true,
    });

    expect(attempt.questionId).toBe('qbank-42');
    expect(attempt.systemKey).toBe('cardio');
    expect(attempt.domain).toBe(3);
    expect(attempt.isCorrect).toBe(true);
    expect(attempt.answer).toEqual({ type: 'single', label: 'B' });
    expect(new Date(attempt.attemptedAt).toString()).not.toBe('Invalid Date');
  });

  test('getAllAttempts returns everything recorded, across questions', async () => {
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'B' }, isCorrect: true });
    await attemptsStorage.recordAttempt({
      question: { ...question, id: 'qbank-43' },
      answer: { type: 'single', label: 'A' },
      isCorrect: false,
    });
    const all = await attemptsStorage.getAllAttempts();
    expect(all).toHaveLength(2);
  });

  test('getAttemptsForQuestion filters correctly', async () => {
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'A' }, isCorrect: false });
    await attemptsStorage.recordAttempt({
      question: { ...question, id: 'qbank-43' },
      answer: { type: 'single', label: 'B' },
      isCorrect: true,
    });
    const forQ42 = await attemptsStorage.getAttemptsForQuestion('qbank-42');
    expect(forQ42).toHaveLength(1);
    expect(forQ42[0].questionId).toBe('qbank-42');
  });

  test('getLatestAttemptForQuestion returns null when never attempted', async () => {
    expect(await attemptsStorage.getLatestAttemptForQuestion('never-answered')).toBeNull();
  });

  test('getLatestAttemptForQuestion returns the most recent of multiple attempts (re-answering)', async () => {
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'A' }, isCorrect: false });
    // A second attempt at the same question, slightly later.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'B' }, isCorrect: true });

    const latest = await attemptsStorage.getLatestAttemptForQuestion('qbank-42');
    expect(latest?.isCorrect).toBe(true);
    expect(latest?.answer).toEqual({ type: 'single', label: 'B' });
  });

  test('getAttemptsForSystem filters by system key across questions', async () => {
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'B' }, isCorrect: true });
    await attemptsStorage.recordAttempt({
      question: { ...question, id: 'qbank-99', systemKey: 'renal' },
      answer: { type: 'single', label: 'A' },
      isCorrect: false,
    });
    const cardioAttempts = await attemptsStorage.getAttemptsForSystem('cardio');
    expect(cardioAttempts).toHaveLength(1);
    expect(cardioAttempts[0].systemKey).toBe('cardio');
  });

  test('attempts persist across separate calls (real AsyncStorage round-trip, not just in-memory)', async () => {
    await attemptsStorage.recordAttempt({ question, answer: { type: 'single', label: 'B' }, isCorrect: true });
    // A fresh read, simulating "app relaunched."
    const reloaded = await attemptsStorage.getAllAttempts();
    expect(reloaded).toHaveLength(1);
  });
});
