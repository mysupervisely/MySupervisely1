import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Attempt, AttemptAnswer } from '../models/attempt';
import type { Question } from '../models';

/**
 * Local-only attempt history (Phase: M4's explicit "Record locally: ...
 * Do not sync remotely"). One append-only JSON array under a single
 * AsyncStorage key — simple and sufficient at QBank scale (thousands of
 * attempts, not millions); if attempt volume ever grows large enough for
 * this to matter, that's a real M6 concern to design around properly
 * (e.g. per-question or per-session keys), not a reason to over-build here.
 *
 * This is a real, permanent piece of the eventual M6 storage layer — not a
 * throwaway stub like M3's progressRepository was before this milestone.
 * M6 should extend this (versioning/migrations across the whole storage
 * layer) rather than replace it.
 */

const ATTEMPTS_KEY = 'pharmdprepped:attempts';

type NewAttemptInput = {
  question: Question;
  answer: AttemptAnswer;
  isCorrect: boolean;
};

async function readAll(): Promise<Attempt[]> {
  try {
    const raw = await AsyncStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(attempts: Attempt[]): Promise<void> {
  await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

export const attemptsStorage = {
  async recordAttempt(input: NewAttemptInput): Promise<Attempt> {
    const attempt: Attempt = {
      id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      questionId: input.question.id,
      systemKey: input.question.systemKey,
      domain: input.question.domain,
      questionType: input.question.type,
      answer: input.answer,
      isCorrect: input.isCorrect,
      attemptedAt: new Date().toISOString(),
    };
    const all = await readAll();
    all.push(attempt);
    await writeAll(all);
    return attempt;
  },

  async getAllAttempts(): Promise<Attempt[]> {
    return readAll();
  },

  async getAttemptsForQuestion(questionId: string): Promise<Attempt[]> {
    const all = await readAll();
    return all.filter((a) => a.questionId === questionId);
  },

  /** Most recent attempt for a question, or null if it's never been answered. */
  async getLatestAttemptForQuestion(questionId: string): Promise<Attempt | null> {
    const forQuestion = await this.getAttemptsForQuestion(questionId);
    if (forQuestion.length === 0) return null;
    return forQuestion.reduce((latest, a) => (a.attemptedAt > latest.attemptedAt ? a : latest));
  },

  async getAttemptsForSystem(systemKey: string): Promise<Attempt[]> {
    const all = await readAll();
    return all.filter((a) => a.systemKey === systemKey);
  },

  /** Test/debug only — clears all recorded attempts. */
  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(ATTEMPTS_KEY);
  },
};
