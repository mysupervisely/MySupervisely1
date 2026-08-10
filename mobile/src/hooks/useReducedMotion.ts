import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * M10 accessibility pass — "reduced-motion considerations." Reads the
 * OS-level Reduce Motion setting (VoiceOver/TalkBack's "Reduce Motion" /
 * "Remove animations") and keeps it live for the component's lifetime,
 * so a decorative, continuously-looping animation (currently just the
 * body-map hotspot pulse — see Hotspot.tsx) can skip itself entirely
 * rather than ignore the setting. Starts `false` (matching the vast
 * majority of users) so there's no flash-of-animation before the real
 * value resolves — a body-map dot pulsing for one extra frame while this
 * loads is a non-issue.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
