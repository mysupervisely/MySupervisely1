# M2 Implementation Notes — Production content repository

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`, and
`docs/M1_IMPLEMENTATION_NOTES.md`. Scope: real content import, typed content repository,
automated validation. **No UI was built** — nothing in `App.tsx` or `src/screens/` imports or
renders content yet; that's M2B (Body Map UI) and beyond.

## Lesson body content: confirmed absent (stop-and-document finding, as instructed)

Before writing the lesson repository, re-verified directly against both source files:

- Every lesson object in `mobile-source/content-export/systems.json` has exactly two string
  keys: `title` and `note`. Confirmed programmatically across all 101 lessons in all 26 systems
  — no other field exists on any lesson object anywhere in the export.
- The longest `note` field across all 101 lessons is 142 characters.
- `mobile-source/web-reference/index.html` — the deployed web app — renders lessons as
  `<h3>{title}</h3><p>{note}</p>` inside a list item, in exactly two places, and has **no lesson
  detail/reader view at all**. The web app itself never displays more than title+note per lesson.

**Finding: there is no full lesson-body prose anywhere in the provided materials, and the web
app doesn't have a lesson reader to begin with — only a lesson list.** `src/models/lesson.ts` is
built to reflect this: `Lesson = { id, systemKey, order, title, note }`, no `body`/`content`
field. `contentRepository.getLessonsForSystem()`/`getLesson()` are metadata accessors, not a
reader. Building an actual "Lesson reader" screen (Phase 6's flow step) is blocked on real
long-form content that doesn't exist yet — this was already flagged as an open decision in
`docs/MOBILE_IMPLEMENTATION_PLAN.md`'s M4 section; this milestone reconfirms it with a fresh,
direct check rather than relying on the earlier audit pass.

## Import summary

`npm run import:content` reads the three raw JSON files from `mobile-source/content-export/`,
transforms them into the normalized shape in `src/models/`, validates the result, and — only
because validation passed — writes `src/content/generated/{systems,lessons,qbank,exams,meta}.json`.
The import aborted with zero output on every attempt until the transform logic was correct;
the version now committed passes cleanly:

```
Importing PharmDPrepped content from mobile-source/content-export...
Validating imported content...
Content validation passed. Wrote:
  systems.json  (27 systems, 101 lessons)
  qbank.json    (2000 questions)
  exams.json    (3 exams)
  meta.json
```

ID scheme (audit §L, no source IDs existed): `qbank-{index}` (0-based, matching source array
position) and `exam-{examNumber}-{slot}` (slot 0-based, matching the source's own string-keyed
slot index). Lesson IDs: `{systemKey}-lesson-{order}`.

## Content statistics

| Collection | Count | Notes |
|---|---|---|
| Systems (from content-export) | 26 | unchanged from audit |
| Systems (synthesized) | 1 | `drug-class-study-guide` — see "Infectious Disease mapping" below |
| Anatomical (body-map) systems | 8 | unchanged from audit — derived from real `x`/`y` presence, not a hand-copied flag |
| Lessons | 101 | metadata only (title + note) |
| QBank questions | 2,000 | single 1,883 / numeric 115 / sata 2 |
| QBank domain split | 500 / 500 / 800 / 100 / 100 | = 25% / 25% / 40% / 5% / 5%, exactly the required NAPLEX blueprint — unchanged, untouched |
| Exams | 3 × 225 = 675 | Exam 1: single 208 / numeric 15 / sata 2 · Exam 2: single 212 / numeric 13 · Exam 3: single 211 / numeric 14 |
| Exam domain split (each exam) | 56 / 56 / 91 / 11 / 11 | identical across all 3 exams |

Full machine-readable version: `mobile/src/content/generated/meta.json`.

## Validation summary

`scripts/validate-content.ts` runs automatically inside `import-content.ts` (import aborts,
writes nothing, exits non-zero on any error) and standalone via `npm run validate:content`
(re-checks the already-generated bundle without touching `mobile-source/`, e.g. for CI where
that directory may not be checked out).

**Checks implemented, all four required by the task plus the count/shape invariants the audit
established:**

1. **Questions reference unknown systems** — every QBank and exam question's resolved
   `systemKey` must exist in the systems collection (including the synthesized bucket).
2. **Exams reference missing questions** — every exam must have exactly 225 populated slots,
   0–224, with no gaps; a hole at any slot is reported by its exact slot number, not just "count
   mismatch."
3. **Lessons reference unknown systems** — every lesson's `systemKey` must resolve to a real
   system.
4. **Duplicate IDs** — checked separately for system keys, lesson IDs, QBank question IDs, and
   exam question IDs (both within an exam and across all three combined), plus a cross-check
   that no QBank ID collides with any exam ID.

**Plus, since the task also asked to "validate all 2,000 questions / all 3 exams / all 26
systems / all lesson metadata":** exact count assertions for QBank total/type-split/domain-split,
exam question-count and domain-split per exam, system count (26 real + derived anatomical count
of 8), lesson count (101), non-empty stem/rationale/title/note, SATA `correctLabels` entries
must each exist among that question's own `options`, numeric `tolerance` must be a non-negative
number.

**Result against the real imported bundle: 0 errors, 0 warnings.**

**Proven, not just asserted:** `scripts/validate-content.test.ts` and
`src/services/contentRepository.test.ts` (20 tests total, `npm test`) deliberately construct
broken synthetic bundles — an unknown-system question, an unknown-system lesson, a hole in an
exam, duplicate IDs (system/lesson/QBank/exam), a SATA `correctLabels` entry not in its own
options, a negative numeric tolerance — and assert `validateContent()` actually reports each one.
This is what makes "the build fails if..." a real, regression-tested guarantee rather than code
that merely looks like it checks these things.

```
PASS scripts/validate-content.test.ts
PASS src/services/contentRepository.test.ts
Test Suites: 2 passed, 2 total
Tests:       20 passed, 20 total
```

## Repository architecture

```
src/models/           Question (discriminated union: single/numeric/sata) | System | Lesson | Exam
src/content/
  topicLabelMap.ts      explicit topicLabel -> systemKey table (27 entries)
  generated/*.json       committed, versioned output of the import step
src/services/
  contentRepository.ts   the only read path for screens
scripts/
  rawTypes.ts             types mirroring the RAW source JSON exactly
  import-content.ts        raw -> normalized -> validate -> write
  validate-content.ts       the validation rules (also a standalone CLI + a re-usable function)
  *.test.ts                 regression tests proving the validator actually catches bad data
```

`contentRepository` builds `Map`-based indices once at module load (by system key, by lesson
system, by question ID, by exam number) rather than scanning the 2,000-question array on every
call. Its surface: `getAllSystems()`, `getAnatomicalSystems()`, `getNonAnatomicalSystems()`,
`getSystem(key)`, `getLessonsForSystem(key)`, `getLesson(id)`, `getQuestions(filter?)`,
`getQuestionById(id)`, `getExam(examNumber)`, `getAllExams()`. `getQuestions()` filters by
`systemKey`/`domain`/`type` — exactly the filter shape M5 (QBank engine) will need.

Nothing in `App.tsx` or `src/screens/` imports `contentRepository` yet — confirmed by grep — so
this milestone has zero UI-visible effect, as instructed.

## Infectious Disease mapping — resolved

`src/content/topicLabelMap.ts` maps `topicLabel: "Infectious Disease"` (55 QBank questions)
explicitly to system key `id`, whose own `label` field is `"Infectious Disease & Immunology"` —
a different string, left exactly as authored in `systems.json` (not renamed to match). All 55
"Infectious Disease"-labeled QBank questions now resolve to the `id` system correctly; verified
by test (`contentRepository.test.ts`: "the Infectious Disease mismatch is resolved").
`Immunology`-labeled questions (45 of them) map to the separate `immuno` system, unaffected —
these were never mismatched, only `Infectious Disease` was.

## SATA and numeric metadata — preserved

- **SATA**: `SataQuestion.correctLabels: string[]` (plural, exact-set match) is carried through
  untouched from the source's own `correctLabels` array. Both real SATA questions (2 in the
  QBank, both also appearing in Exam 1) round-trip through import with their full `options` +
  `correctLabels` intact — verified by test.
- **Numeric**: `NumericQuestion.correctValue`, `.tolerance`, and `.unit` are carried through
  untouched. All 115 QBank + 42 exam numeric questions have a non-negative `tolerance` —
  verified by both the validator and a dedicated test.

Neither question type is treated as a special case anywhere in the repository layer — they're
just two more members of the `Question` discriminated union, exactly as Phase 4 requires
("the question engine must support it" — support starts here, at the data layer, before M5's
scoring engine exists).

## Data inconsistencies discovered

1. **Infectious Disease mapping mismatch** (already known from the audit, now formally
   resolved in code — see above). Not a defect in the source content; `systems.json`'s `id.label`
   describing a broader "Infectious Disease & Immunology" topic while questions are tagged with
   the narrower "Infectious Disease" is a reasonable content decision, it just isn't
   string-matchable, which the explicit mapping table now handles.
2. **"Drug Class Study Guide" is a real, populated topicLabel (99 QBank questions) with no
   corresponding entry in `systems.json`.** Resolved by synthesizing one system-like bucket,
   `drug-class-study-guide` (`source: 'synthesized'` — clearly distinguished from the 26 real
   `content-export` systems so nobody mistakes it for original data). No lessons are attached to
   it; it corresponds to the web app's separate drug-class quick-reference feature, not a
   lesson-bearing topic. This is a structural home for real questions, not fabricated content.
3. **No other mismatches found.** All 25 other `topicLabel` strings match their corresponding
   system's `label` field exactly (re-verified programmatically as part of building
   `topicLabelMap.ts`).
4. **Lesson body content is absent** (see the dedicated section above) — not a data
   inconsistency exactly, but a real content gap worth restating plainly here since it blocks a
   Phase 6 flow step until real content is provided.

No other structural surprises: every exam has exactly 225 contiguous slots, no duplicate IDs
existed in the source (all synthesized IDs are unique by construction and the validator confirms
it), and every question's `options` (for single/SATA) contain their own `correctLabel`/
`correctLabels`.

## Verification performed

- `npm run import:content` — clean, 0 errors.
- `npm run validate:content` — clean, 0 errors, 0 warnings, run standalone against the
  committed bundle.
- `npm run typecheck` — clean (required adding `"types": ["jest", "node"]` to `tsconfig.json`
  and installing `@types/node`, since this TypeScript toolchain didn't auto-discover installed
  `@types/*` packages the way older TS versions do — noted here in case it's confusing later).
- `npm run lint` — clean, 0 errors/warnings.
- `npm test` — 20/20 passing (content stats + validator failure-path regression tests).
- `npx expo export --platform android` — still bundles cleanly; content JSON does not appear in
  the JS bundle output (confirmed by inspecting the export's asset list), because nothing in the
  screen tree imports `contentRepository` yet. This is expected and correct for M2's scope.

## Things to address in M2B / M3+

- `HomeScreen`/`SystemScreen`/`LessonScreen` (M1 stubs) can now be wired to
  `contentRepository.getAnatomicalSystems()` / `getSystem()` / `getLessonsForSystem()` — that's
  M2B/M3's job, not done here.
- `src/navigation/types.ts`'s `systemKey: string` param can be narrowed to a real union once a
  screen actually needs it narrowed (still not urgent).
- Lesson reader remains blocked on real lesson-body content — see the dedicated section above.
