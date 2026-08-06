/**
 * Body-map coordinate system — DOCUMENTED HERE FOR M3, NOT IMPLEMENTED YET.
 *
 * This file intentionally contains geometry constants only. It does not
 * import `mobile-source/content-export/systems.json` or render anything —
 * that's M3's job (real body-map + system/topic navigation). Per the M1
 * scope, this milestone documents and preserves the coordinate system so
 * M3 has a settled contract to build against, without importing content or
 * building the interactive map itself.
 *
 * Source: docs/MOBILE_MIGRATION_AUDIT.md §F, verified against the SVG in
 * `mobile-source/web-reference/index.html` and against
 * `mobile-source/content-export/systems.json`.
 *
 * How the web app positions hotspots:
 *   <svg class="body" viewBox="0 0 300 640">
 *     <circle cx={system.x} cy={system.y} r={8} />   // pulse ring
 *     <circle cx={system.x} cy={system.y} r={6} />   // solid dot
 *
 * Each of the 8 anatomical systems in systems.json carries `x`/`y` in that
 * 300x640 viewBox space. The real illustration asset
 * (`mobile-source/content-export/assets/body_map_diagram.png`, copied here
 * to `assets/brand/body_map_diagram.png`) is 808x1964px — NOT the same
 * aspect ratio as the viewBox (300/640 ≈ 0.469 vs 808/1964 ≈ 0.411), so
 * naively scaling x by (renderedWidth / 300) and y by (renderedHeight / 640)
 * independently is correct ONLY if the image is rendered at the viewBox's
 * own aspect ratio (e.g. via `resizeMode: 'contain'` with letterboxing, or
 * by sizing the container to match 300:640). M3 must not stretch the image
 * to fill an arbitrary container and then apply the naive scale — that will
 * visibly misalign hotspots against the illustration.
 */

export const BODY_MAP_VIEWBOX = {
  width: 300,
  height: 640,
} as const;

export const BODY_MAP_IMAGE_NATURAL_SIZE = {
  width: 808,
  height: 1964,
} as const;

/**
 * The 8 system keys that carry real x/y hotspot coordinates in
 * systems.json, i.e. the ones that render directly on the anatomical body
 * (vs. the 18 "chip: true" systems that only ever render in a list — see
 * audit §C). Listed here, without their coordinates or lesson content, so
 * M3 knows which keys to expect without this milestone importing the full
 * dataset.
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

/**
 * Scales a viewBox-space coordinate to a rendered pixel position, given the
 * on-screen size the illustration is actually rendered at (i.e. after
 * `resizeMode: 'contain'` letterboxing has been accounted for — pass the
 * *rendered image's* box, not the outer container's box).
 *
 * Stubbed here for M3 to implement against; not called anywhere in M1.
 */
export function scaleBodyMapPoint(
  point: { x: number; y: number },
  renderedImageSize: { width: number; height: number }
): { x: number; y: number } {
  const scaleX = renderedImageSize.width / BODY_MAP_VIEWBOX.width;
  const scaleY = renderedImageSize.height / BODY_MAP_VIEWBOX.height;
  return { x: point.x * scaleX, y: point.y * scaleY };
}
