import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AccessRecord } from '../models/access';

/**
 * M9 — the locally cached entitlement record. One key, one JSON object
 * (or nothing, if never verified/cleared) — same pattern as every other
 * storage module in this app. `accessService.ts` is the only caller;
 * screens never touch this directly.
 */

const ACCESS_KEY = 'pharmdprepped:access';

export const accessStorage = {
  async getRecord(): Promise<AccessRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(ACCESS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AccessRecord;
    } catch {
      return null;
    }
  },

  async setRecord(record: AccessRecord): Promise<void> {
    await AsyncStorage.setItem(ACCESS_KEY, JSON.stringify(record));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(ACCESS_KEY);
  },
};
