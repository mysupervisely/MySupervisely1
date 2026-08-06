import { useCallback, useEffect, useState } from 'react';

import { onboardingStorage } from '../storage/onboardingStorage';

/**
 * Reads the persisted onboarding first name (see src/storage/onboardingStorage.ts).
 * `refresh()` is exposed so a screen can re-read after Onboarding writes a new
 * value in the same app session (e.g. via `useFocusEffect`).
 */
export function useFirstName(): { firstName: string | null; refresh: () => void } {
  const [firstName, setFirstName] = useState<string | null>(null);

  const refresh = useCallback(() => {
    onboardingStorage.getFirstName().then(setFirstName);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { firstName, refresh };
}
