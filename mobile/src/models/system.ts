/**
 * System (body-map / topic) domain model.
 *
 * `isAnatomical` is derived at import time from whether the source record
 * carries `x`/`y` hotspot coordinates — the same 8-vs-18 split
 * docs/MOBILE_MIGRATION_AUDIT.md §C documents, computed rather than
 * hand-copied so it can't drift from the underlying coordinates.
 */

export type SystemSource = 'content-export' | 'synthesized';

export type System = {
  key: string;
  label: string;
  description: string;
  /** Dense AI-prompt-style content summary from the source; preserved verbatim, not learner prose. */
  quizBrief?: string;
  isAnatomical: boolean;
  /** Present only when isAnatomical is true. Viewbox-space coordinates — see src/constants/bodyMap.ts. */
  x?: number;
  y?: number;
  /** Raw `chip` flag from the source: true = list-only ("More Topics"), never rendered on the body. */
  chip: boolean;
  available: boolean;
  lessonIds: string[];
  /**
   * 'content-export' for the 26 real systems.json entries; 'synthesized'
   * for the one system this content layer had to invent a home for
   * (the 'drug-class-study-guide' bucket — see
   * docs/M2_IMPLEMENTATION_NOTES.md for why).
   */
  source: SystemSource;
};
