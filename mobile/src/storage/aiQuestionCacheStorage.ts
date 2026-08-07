import AsyncStorage from '@react-native-async-storage/async-storage';

import { aiQuestionConfig } from '../constants/aiQuestionConfig';
import type { SingleAnswerQuestion } from '../models';

/**
 * M8 — local cache of recently AI-generated questions ("Cache recently
 * generated questions locally so students can continue reviewing them
 * offline during the same session"). Same one-JSON-array-under-one-key
 * pattern as attemptsStorage/examResultsStorage — fine at this scale
 * (capped at `aiQuestionConfig.CACHE_MAX_ENTRIES`, oldest evicted first).
 *
 * This is deliberately NOT `contentRepository` data: AI-generated
 * questions are never committed/validated content (source.kind === 'ai'
 * — see src/models/question.ts), so they live in their own storage
 * module rather than being merged into the generated content bundle.
 */

const CACHE_KEY = 'pharmdprepped:aiQuestionCache';

async function readAll(): Promise<SingleAnswerQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const aiQuestionCacheStorage = {
  /** Appends a newly generated question, evicting the oldest entries once over `CACHE_MAX_ENTRIES`. */
  async addQuestion(question: SingleAnswerQuestion): Promise<void> {
    const all = await readAll();
    all.push(question);
    const trimmed = all.slice(-aiQuestionConfig.CACHE_MAX_ENTRIES);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  },

  /** All cached questions, oldest first (insertion order) — the same order they were generated in. */
  async getAll(): Promise<SingleAnswerQuestion[]> {
    return readAll();
  },

  async getById(id: string): Promise<SingleAnswerQuestion | null> {
    const all = await readAll();
    return all.find((q) => q.id === id) ?? null;
  },

  /** Test/debug only — clears the whole cache. */
  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};
