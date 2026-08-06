import { colors } from './colors';
import { fontFamily, typeScale } from './typography';
import { spacing, radius } from './spacing';

/**
 * Single theme object for screens/components that want everything in one
 * place. Prefer importing the individual modules (`colors`, `typeScale`,
 * `spacing`) directly in most components; use this barrel when a component
 * genuinely needs the whole theme (e.g. a theme-aware wrapper).
 */
export const theme = {
  colors,
  fontFamily,
  typeScale,
  spacing,
  radius,
} as const;

export type Theme = typeof theme;

export { colors, fontFamily, typeScale, spacing, radius };
export { fontsToLoad } from './fonts';
