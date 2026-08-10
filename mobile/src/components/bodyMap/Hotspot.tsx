import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { colors } from '../../theme';
import { MIN_HOTSPOT_TOUCH_TARGET } from '../../constants/bodyMap';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const DOT_RADIUS = 7;
const PULSE_MAX_RADIUS = 16;

type HotspotProps = {
  x: number;
  y: number;
  label: string;
  onPress: () => void;
};

/**
 * A single body-map hotspot: a pulsing amber ring (matching the web app's
 * `.hotspot.available` styling) around a solid dot, absolutely positioned
 * by the parent at pre-scaled pixel coordinates. Animation runs on the
 * native driver (opacity + scale only) so it doesn't touch the JS thread
 * or trigger React re-renders once mounted.
 *
 * Memoized: with 8 hotspots re-created from a useMemo'd array in the
 * parent, this still avoids reconciling/re-rendering all 8 whenever an
 * unrelated part of the Home screen re-renders (e.g. the greeting
 * re-fetching the stored name).
 *
 * M10 polish (docs/M3_QA_REVIEW.md #1, #22):
 *  - The dot's ring was `colors.paperRaised` (white) — invisible against
 *    the illustration's white/light-gray backdrop, and the amber fill
 *    alone measures 1.6-2.4:1 contrast against those backdrops (computed
 *    from the real image pixels), well under WCAG 1.4.11's 3:1 minimum
 *    for non-text UI components. The ring is now `colors.ink` — a dark
 *    outline gives the marker's boundary real contrast without abandoning
 *    the brand's amber "available" fill color.
 *  - No press feedback existed at all. `Pressable`'s `pressed` render
 *    prop now swaps the dot to `colors.flag` while actively pressed —
 *    the same color `theme/colors.ts` already documents as the web app's
 *    real "selected" hotspot state, reused here rather than inventing a
 *    new one. (The mobile app navigates to the System screen immediately
 *    on tap, unlike the web app's stay-on-page panel reveal, so a
 *    press-duration flash is the meaningful "selected" moment here rather
 *    than a persisted post-navigation state.)
 *  - The pulse is a continuous, purely decorative animation — exactly
 *    what the OS-level Reduce Motion setting exists to suppress. When
 *    `useReducedMotion()` reports it's on, the loop never starts and the
 *    ring stays fully transparent; the dot itself (and all tap behavior)
 *    is unaffected either way.
 */
export const Hotspot = memo(function Hotspot({ x, y, label, onPress }: HotspotProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, PULSE_MAX_RADIUS / DOT_RADIUS],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.55, 0.25, 0],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} — open lessons and practice questions`}
      hitSlop={Math.max(0, (MIN_HOTSPOT_TOUCH_TARGET - DOT_RADIUS * 2) / 2)}
      onPress={onPress}
      style={[
        styles.touchArea,
        {
          left: x - MIN_HOTSPOT_TOUCH_TARGET / 2,
          top: y - MIN_HOTSPOT_TOUCH_TARGET / 2,
        },
      ]}
    >
      {({ pressed }) => (
        <>
          {reduceMotion ? null : (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulse,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
          )}
          <Animated.View pointerEvents="none" style={[styles.dot, pressed && styles.dotSelected]} />
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  touchArea: {
    position: 'absolute',
    width: MIN_HOTSPOT_TOUCH_TARGET,
    height: MIN_HOTSPOT_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: colors.amber,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  dotSelected: {
    backgroundColor: colors.flag,
    borderColor: colors.ink,
  },
  pulse: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    borderWidth: 2,
    borderColor: colors.amber,
  },
});
