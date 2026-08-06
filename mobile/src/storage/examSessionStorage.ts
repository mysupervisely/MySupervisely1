import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PersistedExamSession } from '../services/examSession';
import type { ExamNumber } from '../models/exam';

/**
 * Persists the LIVE, in-progress exam session — deliberately NOT the
 * `questions` array (see PersistedExamSession's own doc comment): a
 * 225-question exam's full content is several hundred KB, and it's static
 * content already available from contentRepository, so re-persisting it
 * on every navigation/answer would be pure waste. Only the lightweight,
 * genuinely-stateful part (current index, draft answers, flags, the
 * timer's wall-clock anchor, status) is ever written.
 *
 * Keyed per exam number — a student could in principle have an
 * in-progress session recorded for more than one exam (started Exam 1,
 * came back later and started Exam 2 without finishing Exam 1 first).
 */

function key(examNumber: ExamNumber): string {
  return `pharmdprepped:exam:${examNumber}:session`;
}

export const examSessionStorage = {
  async load(examNumber: ExamNumber): Promise<PersistedExamSession | null> {
    try {
      const raw = await AsyncStorage.getItem(key(examNumber));
      if (!raw) return null;
      return JSON.parse(raw) as PersistedExamSession;
    } catch {
      return null;
    }
  },

  async save(session: PersistedExamSession): Promise<void> {
    try {
      await AsyncStorage.setItem(key(session.examNumber), JSON.stringify(session));
    } catch {
      // Best-effort — a failed write shouldn't crash the exam session; the
      // in-memory state is still correct, resume just wouldn't reflect
      // this particular write if the app were killed immediately after.
    }
  },

  async clear(examNumber: ExamNumber): Promise<void> {
    await AsyncStorage.removeItem(key(examNumber));
  },
};
