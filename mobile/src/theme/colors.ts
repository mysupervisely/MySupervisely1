/**
 * PharmDPrepped brand color tokens.
 *
 * Source of truth: the `:root` CSS custom properties in
 * `mobile-source/web-reference/index.html`, confirmed against
 * `docs/MOBILE_MIGRATION_AUDIT.md` §J. Do not invent new brand colors here —
 * if a screen needs a color this file doesn't have, that's a design gap to
 * raise, not something to improvise locally in a component.
 */

export const colors = {
  /** Deep ink navy — primary text, headings, nav */
  ink: '#12213B',
  /** Softer body-text tint of ink, used for secondary copy on the web app */
  inkSoft: '#3D4B66',
  /** Primary background */
  paper: '#F2F4F3',
  /** Raised surfaces (cards, panels) on top of paper */
  paperRaised: '#FFFFFF',
  /** Primary brand accent — buttons, links, active states */
  teal: '#0F7D80',
  /** Deeper teal — pressed states, high-contrast accents */
  tealDeep: '#0B5C5E',
  /** Secondary accent — highlights, badges, in-progress indicators */
  amber: '#DD9A32',
  /**
   * "Flag" red — semantic danger/incorrect color. Used on the web app for
   * low-accuracy topic indicators and the selected/incorrect state on the
   * body map and question review. Not in the original brief's color list but
   * confirmed in the audit (§J) as part of the real brand system — use this
   * rather than inventing a new red for error/incorrect states.
   */
  flag: '#AE3B45',
  /** Hairline borders / dividers, matches the web app's `--line` token */
  line: 'rgba(18, 33, 59, 0.12)',
} as const;

export type ColorToken = keyof typeof colors;
