# content/

The typed, production content bundle (M2). Real PharmDPrepped content only — no placeholders.

```
content/
  topicLabelMap.ts     explicit topicLabel -> system-key mapping (resolves the
                        Infectious Disease mismatch + the orphan Drug Class
                        Study Guide topic — see the file's own doc comment)
  generated/            output of `npm run import:content` — committed, versioned,
                         what the app actually ships with:
    systems.json         27 entries: 26 real + 1 synthesized (drug-class-study-guide)
    lessons.json          101 lesson {title, note} records
    qbank.json            2,000 QBank questions
    exams.json             3 fixed 225-question exams
    meta.json              generation timestamp + counts, for quick sanity checks
```

**Nothing reads these files directly except `src/services/contentRepository.ts`.** Screens go
through the repository, never `require()`/`import` these JSON files themselves (Phase 3).

## Regenerating

```
npm run import:content     # reads ../mobile-source/content-export, validates, writes generated/
npm run validate:content   # re-validates the already-generated bundle without re-importing
```

`import:content` aborts and writes nothing if validation fails — see
`scripts/validate-content.ts` and `docs/M2_IMPLEMENTATION_NOTES.md` for exactly what's checked.

## Lesson content note

Lesson records here are metadata only (`title` + `note`, ~140 chars max) — there is no full
lesson-body prose in the source content, confirmed by direct inspection (see
`docs/M2_IMPLEMENTATION_NOTES.md`, "Lesson body content: confirmed absent"). Do not add a `body`
field with invented text.
