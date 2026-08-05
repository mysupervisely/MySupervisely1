# PharmDPrepped — Content Export

Real content pulled directly from the live PharmDPrepped website, packaged for
handoff to Claude Code (or any other dev tool) when building the mobile app.

## What's in here

### `qbank_questions.json`
All 2,000 QBank practice questions. Each question is one of two types:

- `type: "single"` — 4 answer options (`options: [{label, text}]`) plus a
  `correctLabel` and a `rationale` string explaining the answer.
- `type: "numeric"` — a calculation question with `correctValue`, `tolerance`,
  `unit`, and a `rationale`.

Every question also has a `domain` (1–5, matching the official NAPLEX blueprint
weighting: 25/25/40/5/5) and a `topicLabel` (e.g. "Cardiovascular",
"Calculations Toolkit") used to tag it to a system/topic.

### `exam_question_bank.json`
The 3 fixed full-length practice exams. Structure is
`{ "1": { "0": {...question}, "1": {...question}, ... }, "2": {...}, "3": {...} }`
— each exam has 225 questions, keyed by slot index rather than an array (this
matches how the web app looks them up: `EXAM_QUESTION_BANK[examNumber][slotIndex]`).
Same question shape as above (single or numeric type).

### `systems.json`
The 26 body-system/topic entries that drive both the lesson content and the
interactive body-map navigation. Each entry has:

- `label` — display name (e.g. "Cardiovascular")
- `description` — 1–2 sentence summary of what the topic covers
- `lessons` — array of `{ title }` objects (the ~101 total short lessons)
- `available` — whether this system currently has real content behind it
- `chip` — `true` if it should render only in the supplementary "more systems"
  list instead of on the body diagram
- `x`, `y` — hotspot coordinates for the 8 systems that DO render directly on
  the body diagram (Cardiovascular, Neuro & Psych, Pulmonary, GI & Hepatic,
  Endocrine, Renal, Urology, Rheumatology). Coordinates are in a 300×640
  viewBox — if the mobile body-map diagram uses different dimensions, these
  need to be rescaled proportionally, not reused as-is.

### `assets/logo_mark.png`
Icon-only version of the logo (the "P" with the pill/capsule cut into it, no
wordmark). Transparent background. Use this for app icons, nav bars, anywhere
small.

### `assets/logo_full_lockup.png`
Full logo with "PharmDPrepped" wordmark and "PREPARE · PRACTICE · PASS"
tagline underneath. Transparent background.

### `assets/body_map_diagram.png`
The actual anatomical body illustration used for the body-map screen.
Transparent background, high resolution (808×1964). This is a real traced
illustration, not a placeholder — if the mobile app rebuilds the body map as
native vector shapes instead of an image, this is still useful as a visual
reference for proportions.

## Quick sanity numbers
- 2,000 QBank questions, domain split exactly 500/500/800/100/100
- 675 exam questions (3 × 225)
- 101 written lessons across 26 systems/topics
- 8 systems with body-map hotspot coordinates; the other 18 are list-only
