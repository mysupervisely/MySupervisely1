# AGENTS.md — PharmDPrepped Mobile (Expo / React Native / TypeScript)

This is the PharmDPrepped mobile app, built inside the MySupervisely1 repo on the
`claude/pharmdprepped-react-native-vao3jr` branch (unrelated to the web app at the repo root —
see the root `AGENTS.md` for that project). Read `docs/MOBILE_MIGRATION_AUDIT.md` and
`docs/MOBILE_IMPLEMENTATION_PLAN.md` at the repo root before making changes here — they're the
source of truth for what's real content/behavior vs. what mobile is rebuilding, and the
milestone this codebase is currently at.

## Stack

Expo (managed workflow), React Native, TypeScript, React Navigation (typed). Expo SDK 57 / React
Native 0.86 / React 19.2 — check `node_modules/expo/bundledNativeModules.json` for SDK-compatible
native module versions before adding one manually; `npx expo install` needs `api.expo.dev`,
which may not be reachable from every environment this repo is worked in, so pin versions
directly against that file if `expo install` fails with a proxy/network error.

## Folder structure

```
src/
  api/            typed clients for the existing Netlify functions (M9/M10)
  components/     presentational, reusable, no data-fetching
  content/        typed, production content bundle — generated/ is committed output,
                   topicLabelMap.ts is the hand-maintained topicLabel -> system-key table (M2)
  models/         domain TypeScript types (M2)
  navigation/     typed React Navigation param lists + navigators
  screens/        one folder per section (onboarding, home, qbank, exam, progress, pricing)
  storage/        AsyncStorage repositories (M6)
  services/       business logic / repository pattern, no UI — contentRepository lives here (M2)
  utils/          stateless helpers
  hooks/          shared hooks wrapping services/
  theme/          brand tokens (colors, typography, spacing) + font loading
  constants/      cross-milestone constants, e.g. body-map geometry
scripts/          build-time only, not part of the app bundle: import-content.ts (reads
                   ../mobile-source/content-export, validates, writes src/content/generated/)
                   and validate-content.ts (the validation rules + a standalone re-check CLI).
                   Run via `npm run import:content` / `npm run validate:content`.
```

Repository/service pattern: screens never parse raw content JSON directly — they go through
`services/contentRepository`. Don't scatter `AsyncStorage` calls in components — go through
`storage/` once it exists (M6).

## Content changes

If `mobile-source/content-export/` changes, re-run `npm run import:content` — don't hand-edit
anything under `src/content/generated/`, it's generated output. If a new `topicLabel` shows up
in the source data that isn't in `src/content/topicLabelMap.ts`, the import fails loudly rather
than silently dropping or miscategorizing questions — add the mapping entry first.

## Source materials

`../mobile-source/` (repo root) holds the verbatim provided source-of-truth files: the real
content export (`content-export/`) and the deployed web app for behavior reference
(`web-reference/`). Nothing in this app should hand-copy from there directly except through a
deliberate, documented import step (M2 for content).

## Current milestone

See `docs/MOBILE_IMPLEMENTATION_PLAN.md` for the full M1–M12 sequence and
`docs/M1_IMPLEMENTATION_NOTES.md` for what M1 specifically shipped and left for M2.
