/**
 * Lesson domain model — METADATA ONLY.
 *
 * The content export's lesson objects carry exactly two string fields,
 * `title` and `note` (max ~140 characters) — confirmed by direct inspection
 * of mobile-source/content-export/systems.json and cross-checked against
 * mobile-source/web-reference/index.html, which itself only ever renders
 * `title`/`note` in a list item and has no lesson detail/reader view at all.
 * There is no full lesson-body prose anywhere in the provided materials.
 *
 * This type intentionally has no `body`/`content` field. Do not add one
 * with fabricated text — see docs/M2_IMPLEMENTATION_NOTES.md "Lesson body
 * content: confirmed absent" for the full finding. If real lesson-body
 * copy is provided later, add the field then.
 */
export type Lesson = {
  id: string;
  systemKey: string;
  /** 0-based position within the parent system's lesson list. */
  order: number;
  title: string;
  note: string;
};
