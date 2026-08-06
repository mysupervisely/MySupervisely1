import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { colors } from '../../theme';

const DOT_RADIUS = 7;
const PULSE_MAX_RADIUS = 16;
/** Touch targets must be >= 44pt (accessibility requirement) even though the visible dot is small. */
const MIN_TOUCH_TARGET = 44;

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
 */
export const Hotspot = memo(function Hotspot({ x, y, label, onPress }: HotspotProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

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
      hitSlop={Math.max(0, (MIN_TOUCH_TARGET - DOT_RADIUS * 2) / 2)}
      onPress={onPress}
      style={[
        styles.touchArea,
        {
          left: x - MIN_TOUCH_TARGET / 2,
          top: y - MIN_TOUCH_TARGET / 2,
        },
      ]}
    >
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
      <Animated.View pointerEvents="none" style={styles.dot} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  touchArea: {
    position: 'absolute',
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: colors.amber,
    borderWidth: 2,
    borderColor: colors.paperRaised,
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
