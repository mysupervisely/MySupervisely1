import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ExamResult } from '../models/examResult';
import type { ExamNumber } from '../models/exam';

/**
 * Permanent history of completed exam attempts — separate from
 * examSessionStorage (the LIVE, in-progress session for one attempt).
 * A student can retake an exam; each submission appends a new result
 * rather than overwriting the last one, so past attempts remain
 * reviewable. One JSON array under a single key, same pattern as
 * attemptsStorage (M4) — fine at this scale (at most a few results per
 * exam per student, nowhere near the volume that motivated flagging
 * attemptsStorage's scaling as an M6+ concern).
 */

const RESULTS_KEY = 'pharmdprepped:examResults';

async function readAll(): Promise<ExamResult[]> {
  try {
    const raw = await AsyncStorage.getItem(RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const examResultsStorage = {
  async saveResult(result: ExamResult): Promise<void> {
    const all = await readAll();
    all.push(result);
    await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(all));
  },

  async getAllResults(): Promise<ExamResult[]> {
    return readAll();
  },

  async getResultsForExam(examNumber: ExamNumber): Promise<ExamResult[]> {
    const all = await readAll();
    return all.filter((r) => r.examNumber === examNumber);
  },

  async getLatestResultForExam(examNumber: ExamNumber): Promise<ExamResult | null> {
    const results = await this.getResultsForExam(examNumber);
    if (results.length === 0) return null;
    return results.reduce((latest, r) => (r.submittedAt > latest.submittedAt ? r : latest));
  },

  async getResultById(id: string): Promise<ExamResult | null> {
    const all = await readAll();
    return all.find((r) => r.id === id) ?? null;
  },

  /** Test/debug only. */
  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(RESULTS_KEY);
  },
};
