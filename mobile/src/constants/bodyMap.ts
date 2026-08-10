/**
 * Body-map coordinate system — implemented in M3.
 *
 * Source: docs/MOBILE_MIGRATION_AUDIT.md §F, and a direct check of the SVG
 * markup in mobile-source/web-reference/index.html:
 *
 *   <svg class="body" viewBox="0 0 300 640" ...>
 *     <image x="0" y="0" width="300" height="640" preserveAspectRatio="none" .../>
 *     <circle cx={system.x} cy={system.y} r={8} />
 *
 * CORRECTED FINDING (M1's version of this file guessed wrong — recorded
 * here so nobody re-introduces the mistake): `preserveAspectRatio="none"`
 * means the web app does NOT letterbox/contain-fit the body illustration.
 * It deliberately STRETCHES the 808x1964 source image, non-uniformly, to
 * exactly fill the 300x640 viewBox. The x/y hotspot coordinates in
 * systems.json were authored against that stretched rendering, not against
 * the image's native aspect ratio.
 *
 * The correct (and simplest) way to reproduce this exactly in React Native
 * is to do the same thing: render the image with `resizeMode="stretch"`
 * inside a container locked to the same 300:640 aspect ratio (via the
 * `aspectRatio` style, independent of screen width), then scale each
 * point by the container's own *measured* width/height. Because the image
 * fills that container exactly (no letterboxing), the container's
 * measured box IS the image's rendered box — no separate "where did the
 * letterboxing put the image" calculation is needed.
 */

export const BODY_MAP_VIEWBOX = {
  width: 300,
  height: 640,
} as const;

export const BODY_MAP_ASPECT_RATIO = BODY_MAP_VIEWBOX.width / BODY_MAP_VIEWBOX.height;

export const BODY_MAP_IMAGE_NATURAL_SIZE = {
  width: 808,
  height: 1964,
} as const;

/**
 * The 8 system keys that carry real x/y hotspot coordinates in
 * systems.json — i.e. the ones that render directly on the anatomical
 * body (vs. the 18 "chip: true" systems, plus the synthesized
 * `drug-class-study-guide` bucket, that only ever render in "More
 * Topics"). Kept here as a documented reference list; the actual source of
 * truth at runtime is `contentRepository.getAnatomicalSystems()`
 * (`System.isAnatomical`, derived from real x/y presence — not this list).
 */
export const BODY_MAP_ANATOMICAL_SYSTEM_KEYS = [
  'cardio',
  'neuro',
  'respiratory',
  'gi',
  'endocrine',
  'renal',
  'uro',
  'rheum',
] as const;

export type BodyMapAnatomicalSystemKey = (typeof BODY_MAP_ANATOMICAL_SYSTEM_KEYS)[number];

/** Touch targets must be >= 44pt (accessibility requirement) even though the visible hotspot dot is much smaller. Shared by Hotspot.tsx (touch area sizing) and separateOverlappingTouchTargets below (the minimum distance two targets must clear). */
export const MIN_HOTSPOT_TOUCH_TARGET = 44;

/**
 * Scales a viewBox-space coordinate (as authored in systems.json, 0-300 /
 * 0-640) to a pixel position within a container that is rendering the body
 * image at `resizeMode="stretch"` and is itself locked to
 * BODY_MAP_ASPECT_RATIO. `containerSize` must be that container's own
 * measured box (e.g. from `onLayout`) — since the image is stretched to
 * fill it exactly, the container's box and the image's rendered box are
 * the same rectangle.
 */
export function scaleBodyMapPoint(
  point: { x: number; y: number },
  containerSize: { width: number; height: number }
): { x: number; y: number } {
  const scaleX = containerSize.width / BODY_MAP_VIEWBOX.width;
  const scaleY = containerSize.height / BODY_MAP_VIEWBOX.height;
  return { x: point.x * scaleX, y: point.y * scaleY };
}

/**
 * M10 polish — docs/M3_QA_REVIEW.md #7: at real phone widths (320-375pt),
 * the GI and Endocrine hotspots' 44x44pt touch targets are close enough
 * together (center distance 35.8-41.9pt, computed from the real
 * `systems.json` coordinates) to genuinely overlap, so a tap aimed at one
 * can register on the other. "Do not change the underlying coordinate
 * system unless necessary" (M10) — so this doesn't touch `systems.json`
 * or `scaleBodyMapPoint`. Instead, given the already-scaled on-screen
 * positions, it nudges any pair of points closer together than
 * `minDistance` apart along the line connecting them (splitting the
 * deficit evenly) until they clear it — a few points of movement, only
 * engaging at the narrow width range where it's actually needed (above
 * ~414pt the real coordinates already clear 44pt on their own and this
 * is a no-op), and generic rather than a hardcoded "gi vs endocrine"
 * special case (so it stays correct if content coordinates ever change).
 */
export function separateOverlappingTouchTargets<T extends { x: number; y: number }>(
  points: T[],
  minDistance: number
): T[] {
  const result = points.map((p) => ({ ...p }));

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Exactly-coincident points (distance 0) aren't real content today and
      // have no well-defined separation direction — leave them as-is rather
      // than dividing by zero.
      if (distance === 0 || distance >= minDistance) continue;

      const deficit = minDistance - distance;
      const unitX = dx / distance;
      const unitY = dy / distance;
      const push = deficit / 2;

      a.x -= unitX * push;
      a.y -= unitY * push;
      b.x += unitX * push;
      b.y += unitY * push;
    }
  }

  return result;
}
