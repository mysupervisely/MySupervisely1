import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Minimal, scoped-early exception to the "storage lands in M6" boundary
 * (docs/MOBILE_IMPLEMENTATION_PLAN.md M6). M3's Home screen greeting
 * ("Good morning, {name}") needs the onboarding name to actually persist
 * to be real rather than decorative — so this one field gets a dedicated
 * repository now, rather than a scattered `AsyncStorage.getItem` call
 * inside a screen component (Phase 9's rule against that applies just as
 * much to a single field as to the full attempts/progress schema).
 *
 * This is NOT the M6 storage layer. It has no schema version, no
 * migration runner, and covers exactly one field. M6 should absorb this
 * into its versioned schema rather than leaving it as a permanent
 * exception — see docs/M3_IMPLEMENTATION_NOTES.md.
 */

const FIRST_NAME_KEY = 'pharmdprepped:onboarding:firstName';

export const onboardingStorage = {
  async getFirstName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(FIRST_NAME_KEY);
    } catch {
      return null;
    }
  },

  async setFirstName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await AsyncStorage.setItem(FIRST_NAME_KEY, trimmed);
    } catch {
      // Best-effort — a failed write shouldn't block onboarding completion.
    }
  },
};
