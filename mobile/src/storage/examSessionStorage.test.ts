import { examSessionStorage } from './examSessionStorage';
import { createExamSession, toPersisted } from '../services/examSession';

const START = new Date(2026, 0, 1, 8, 0, 0);

beforeEach(async () => {
  await examSessionStorage.clear(1);
  await examSessionStorage.clear(2);
});

describe('examSessionStorage — resume persistence', () => {
  test('load returns null when nothing has been saved yet', async () => {
    expect(await examSessionStorage.load(1)).toBeNull();
  });

  test('save/load round-trips the persisted (questions-stripped) shape', async () => {
    const session = toPersisted(createExamSession(1, [], START));
    await examSessionStorage.save({ ...session, currentIndex: 42, flaggedQuestionIds: ['exam-1-5'] });

    const loaded = await examSessionStorage.load(1);
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty('questions');
    expect(loaded?.currentIndex).toBe(42);
    expect(loaded?.flaggedQuestionIds).toEqual(['exam-1-5']);
    expect(loaded?.startedAt).toBe(START.toISOString());
  });

  test('each exam number is stored independently', async () => {
    await examSessionStorage.save(toPersisted(createExamSession(1, [], START)));
    expect(await examSessionStorage.load(2)).toBeNull();
  });

  test('clear removes only that exam\'s session', async () => {
    await examSessionStorage.save(toPersisted(createExamSession(1, [], START)));
    await examSessionStorage.save(toPersisted(createExamSession(2, [], START)));
    await examSessionStorage.clear(1);
    expect(await examSessionStorage.load(1)).toBeNull();
    expect(await examSessionStorage.load(2)).not.toBeNull();
  });
});
