import { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Hotspot } from './Hotspot';
import { BODY_MAP_ASPECT_RATIO, scaleBodyMapPoint } from '../../constants/bodyMap';
import type { System } from '../../models';

type BodyMapViewProps = {
  /** The 8 anatomical systems (System.isAnatomical) — real content, from contentRepository. */
  systems: System[];
  onSelectSystem: (systemKey: string) => void;
};

/**
 * Real body-map illustration + real, coordinate-driven hotspots.
 *
 * Renders the image at `resizeMode="stretch"` inside a container locked to
 * the viewBox's own aspect ratio (300:640) — this exactly reproduces the
 * web app's `preserveAspectRatio="none"` SVG behavior (see
 * src/constants/bodyMap.ts for why that's the *correct* match, not a
 * compromise). Because the image fills the container exactly, the
 * container's own measured width is all that's needed to compute every
 * hotspot's pixel position — no separate letterboxing calculation.
 */
export function BodyMapView({ systems, onSelectSystem }: BodyMapViewProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  const containerHeight = containerWidth / BODY_MAP_ASPECT_RATIO;

  // Recomputed only when the system list or the measured width changes —
  // not on every render (e.g. not when a sibling's greeting re-fetches).
  const hotspots = useMemo(() => {
    if (containerWidth === 0) return [];
    return systems
      .filter((s) => typeof s.x === 'number' && typeof s.y === 'number')
      .map((s) => {
        const { x, y } = scaleBodyMapPoint(
          { x: s.x as number, y: s.y as number },
          { width: containerWidth, height: containerHeight }
        );
        return { systemKey: s.key, label: s.label, x, y };
      });
  }, [systems, containerWidth, containerHeight]);

  return (
    <View
      style={[styles.container, { aspectRatio: BODY_MAP_ASPECT_RATIO }]}
      onLayout={handleLayout}
      accessibilityRole="none"
    >
      <Image
        source={require('../../../assets/brand/body_map_diagram.png')}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
        // Decorative — each real hotspot below carries its own accessible label.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {hotspots.map((h) => (
        <Hotspot
          key={h.systemKey}
          x={h.x}
          y={h.y}
          label={h.label}
          onPress={() => onSelectSystem(h.systemKey)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
