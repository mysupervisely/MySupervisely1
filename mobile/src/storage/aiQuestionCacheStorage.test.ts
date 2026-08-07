import { aiQuestionCacheStorage } from './aiQuestionCacheStorage';
import { aiQuestionConfig } from '../constants/aiQuestionConfig';
import type { SingleAnswerQuestion } from '../models';

function makeQuestion(overrides: Partial<SingleAnswerQuestion> = {}): SingleAnswerQuestion {
  return {
    id: `ai-${Math.random().toString(36).slice(2)}`,
    type: 'single',
    stem: 'A patient presents with...',
    rationale: 'Because...',
    domain: 1,
    systemKey: 'cardio',
    topicLabel: 'Cardiovascular',
    source: { kind: 'ai', generatedAt: '2026-01-01T09:00:00.000Z' },
    options: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
    ],
    correctLabel: 'A',
    ...overrides,
  };
}

beforeEach(async () => {
  await aiQuestionCacheStorage.clearAll();
});

describe('aiQuestionCacheStorage', () => {
  test('addQuestion appends rather than overwrites', async () => {
    await aiQuestionCacheStorage.addQuestion(makeQuestion({ id: 'q1' }));
    await aiQuestionCacheStorage.addQuestion(makeQuestion({ id: 'q2' }));
    const all = await aiQuestionCacheStorage.getAll();
    expect(all.map((q) => q.id)).toEqual(['q1', 'q2']);
  });

  test('getById resolves a specific cached question', async () => {
    await aiQuestionCacheStorage.addQuestion(makeQuestion({ id: 'find-me' }));
    expect((await aiQuestionCacheStorage.getById('find-me'))?.id).toBe('find-me');
    expect(await aiQuestionCacheStorage.getById('does-not-exist')).toBeNull();
  });

  test('evicts the OLDEST entries once over CACHE_MAX_ENTRIES, keeping the most recent ones', async () => {
    for (let i = 0; i < aiQuestionConfig.CACHE_MAX_ENTRIES + 5; i++) {
      await aiQuestionCacheStorage.addQuestion(makeQuestion({ id: `q${i}` }));
    }
    const all = await aiQuestionCacheStorage.getAll();
    expect(all).toHaveLength(aiQuestionConfig.CACHE_MAX_ENTRIES);
    // The first 5 (oldest) were evicted; the cache starts at q5.
    expect(all[0].id).toBe('q5');
    expect(all[all.length - 1].id).toBe(`q${aiQuestionConfig.CACHE_MAX_ENTRIES + 4}`);
  });

  test('results persist across separate calls (real AsyncStorage round-trip)', async () => {
    await aiQuestionCacheStorage.addQuestion(makeQuestion({ id: 'q1' }));
    const reloaded = await aiQuestionCacheStorage.getAll();
    expect(reloaded).toHaveLength(1);
  });

  test('clearAll empties the cache', async () => {
    await aiQuestionCacheStorage.addQuestion(makeQuestion({}));
    await aiQuestionCacheStorage.clearAll();
    expect(await aiQuestionCacheStorage.getAll()).toEqual([]);
  });
});
