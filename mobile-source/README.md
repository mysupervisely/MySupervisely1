# mobile-source/ — preserved input materials (not app code)

This directory is **not** part of the mobile application. It's a verbatim copy of the two
source files handed off for the PharmDPrepped → React Native migration, preserved here because
the session environment they were uploaded into is ephemeral. Nothing in this directory should
be imported directly by app code — Milestone M2 (see `docs/MOBILE_IMPLEMENTATION_PLAN.md`) reads
from here once to build the versioned, typed content bundle the app actually ships with.

## `content-export/` — the real PharmDPrepped content (source of truth for content)

Unzipped copy of `pharmdprepped_content_export.zip`, exactly as provided:

- `qbank_questions.json` — all 2,000 QBank questions
- `exam_question_bank.json` — the 3 fixed 225-question practice exams
- `systems.json` — the 26 body-system/topic entries (lessons, descriptions, body-map hotspot x/y)
- `assets/` — real logo and body-map artwork (`logo_mark.png`, `logo_full_lockup.png`,
  `body_map_diagram.png`)
- `README.md` — the original export README describing the shapes above

## `web-reference/` — the deployed PharmDPrepped web app (source of truth for behavior)

Unzipped copy of the file the user provided in place of the originally-requested
`PharmDPreppedMobileScaffold.zip` — a Netlify deploy bundle named
`pharmdpreppednetlifydeploy.zip`. **No mobile scaffold was ever provided in this session** (see
`docs/MOBILE_MIGRATION_AUDIT.md` §A for what this means for M1). This bundle is:

- `index.html` — the entire marketing site + interactive product surface (body map, lessons,
  QBank-backed practice exams, AI demo widgets, pricing calculator) as one file, plain
  HTML/CSS/JS with no framework or build step
- `qbank-data.js` — `QBANK_QUESTIONS` / `EXAM_QUESTION_BANK`, deferred-loaded by `index.html`
- `success.html` — Stripe checkout return page
- `netlify.toml`, `package.json` — build config (no dependencies; static publish)
- `netlify/functions/*.mts` — the 5 serverless functions: `create-checkout`, `verify-session`,
  `check-access`, `generate-question`, `progress`

Read `docs/MOBILE_MIGRATION_AUDIT.md` before touching either directory — several details here
(pricing, access-gating, AI-question calls) are **not** what the task brief assumed, and the
audit documents exactly where reality diverges and why.
