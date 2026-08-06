import { examResultsStorage } from './examResultsStorage';
import type { ExamResult } from '../models/examResult';

function makeResult(overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    id: `result-${Math.random().toString(36).slice(2)}`,
    examNumber: 1,
    submittedAt: '2026-01-01T09:00:00.000Z',
    totalQuestions: 225,
    answeredCount: 200,
    correctCount: 150,
    accuracyPct: 75,
    scorePct: 67,
    domainBreakdown: [],
    systemBreakdown: [],
    flaggedQuestionIds: [],
    incorrectQuestionIds: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await examResultsStorage.clearAll();
});

describe('examResultsStorage', () => {
  test('saveResult appends rather than overwrites — retakes preserve history', async () => {
    await examResultsStorage.saveResult(makeResult({ id: 'r1', submittedAt: '2026-01-01T09:00:00.000Z' }));
    await examResultsStorage.saveResult(makeResult({ id: 'r2', submittedAt: '2026-01-05T09:00:00.000Z' }));
    const all = await examResultsStorage.getAllResults();
    expect(all).toHaveLength(2);
  });

  test('getResultsForExam filters by exam number', async () => {
    await examResultsStorage.saveResult(makeResult({ id: 'r1', examNumber: 1 }));
    await examResultsStorage.saveResult(makeResult({ id: 'r2', examNumber: 2 }));
    expect(await examResultsStorage.getResultsForExam(1)).toHaveLength(1);
    expect(await examResultsStorage.getResultsForExam(2)).toHaveLength(1);
  });

  test('getLatestResultForExam returns the most recent of several attempts', async () => {
    await examResultsStorage.saveResult(
      makeResult({ id: 'r1', examNumber: 1, submittedAt: '2026-01-01T09:00:00.000Z', scorePct: 50 })
    );
    await examResultsStorage.saveResult(
      makeResult({ id: 'r2', examNumber: 1, submittedAt: '2026-01-05T09:00:00.000Z', scorePct: 80 })
    );
    const latest = await examResultsStorage.getLatestResultForExam(1);
    expect(latest?.id).toBe('r2');
    expect(latest?.scorePct).toBe(80);
  });

  test('getLatestResultForExam returns null when the exam has never been taken', async () => {
    expect(await examResultsStorage.getLatestResultForExam(3)).toBeNull();
  });

  test('getResultById resolves a specific historical result', async () => {
    await examResultsStorage.saveResult(makeResult({ id: 'find-me' }));
    const found = await examResultsStorage.getResultById('find-me');
    expect(found?.id).toBe('find-me');
    expect(await examResultsStorage.getResultById('does-not-exist')).toBeNull();
  });

  test('results persist across separate calls (real AsyncStorage round-trip)', async () => {
    await examResultsStorage.saveResult(makeResult({ id: 'r1' }));
    const reloaded = await examResultsStorage.getAllResults();
    expect(reloaded).toHaveLength(1);
  });
});
