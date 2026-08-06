import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists "which QBank question was I on," so relaunching the app resumes
 * the sequential session rather than restarting at question 1 (M4's
 * explicit "Resume session" requirement). Deliberately minimal — just an
 * index — because M4 has no filters/randomization/bookmarks yet, so a
 * single position is the entire session state worth remembering. Exams
 * (M7) will need their own, richer session state (timer, per-slot answers)
 * and should get their own storage module rather than this one growing
 * exam-specific fields.
 */

const QBANK_INDEX_KEY = 'pharmdprepped:qbank:currentIndex';

export const qbankSessionStorage = {
  async getCurrentIndex(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(QBANK_INDEX_KEY);
      if (!raw) return 0;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  },

  async setCurrentIndex(index: number): Promise<void> {
    try {
      await AsyncStorage.setItem(QBANK_INDEX_KEY, String(index));
    } catch {
      // Best-effort — a failed write shouldn't interrupt the study session.
    }
  },
};
