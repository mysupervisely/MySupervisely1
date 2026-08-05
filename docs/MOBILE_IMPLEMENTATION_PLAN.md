# PharmDPrepped Mobile Implementation Plan

Companion to `docs/MOBILE_MIGRATION_AUDIT.md` — read that first. This plan sequences the work
into the M1–M12 milestones from the task brief (Phase 15), adjusted where the audit found the
brief's assumptions didn't hold (no scaffold; payments unfinished even on web). **No
implementation has started.** This document is the Phase 2 deliverable; work begins only after
approval.

## Ground rules carried into every milestone

- Real content only (`mobile-source/content-export/`). No placeholder questions/lessons.
- Question wording, rationales, and domain distribution (25/25/40/5/5) are never edited.
- No AI generation logic in the client; only `generate-question.mts`'s existing contract is
  called (audit §I). No Anthropic key ever ships in the app bundle.
- No payment logic duplicated client-side beyond a thin service abstraction (audit §M/P).
- One service/repository per responsibility; no giant files; screens don't parse raw JSON.
- Each milestone ends with the app building and runnable in Expo Go / a dev client.

---

### M1 — Project setup, navigation, theme
- `npx create-expo-app` (TypeScript template), strict `tsconfig`.
- React Navigation with fully typed param lists (native-stack + bottom-tabs).
- `theme/` with the confirmed brand tokens (audit §J), including `--flag` as the semantic
  danger/incorrect color, and bundled fonts via `expo-font` (Space Grotesk, Source Serif 4, IBM
  Plex Mono).
- Empty screen stubs for the Phase 6 flow (Onboarding → Home/Body Map → System → Lessons →
  Practice → Rationale → Progress) plus QBank/Exams/AI-Practice/Progress/Pricing entry points,
  wired into navigation with placeholder content only (no fake question content).
- **Acceptance:** app boots on iOS + Android simulators, nav between empty screens works, fonts
  and theme render correctly light/dark if applicable to the brand ("Paper" background implies
  primarily light — confirm with user whether dark mode is in scope before designing for it).

### M2 — Real content import + typed content repository
- One-time import script reads `mobile-source/content-export/*.json`, assigns stable
  synthetic IDs (`qbank-{n}`, `exam-{examNum}-{slot}`), resolves the topicLabel→system mapping
  table from audit §C explicitly (not by string match), and emits normalized TS-typed JSON
  bundled under `src/content/`.
- `models/` discriminated union: `Question = SingleQuestion | NumericQuestion | SataQuestion`,
  each carrying `id, stem, options?, correctLabel?, correctLabels?, correctValue?, tolerance?,
  unit?, rationale, domain, systemKey, topicLabel, type`. No silent rewording (Phase 4).
- `contentRepository`: `getSystem(key)`, `getLesson(systemKey, index)`, `getQuestions(filter)`,
  `getExam(examNum)`, `getAllSystems()`. Screens depend only on this.
- **Acceptance:** unit test asserts 2,000/1,883/115/2 counts and 500/500/800/100/100 domain
  split survive import unchanged; 675 exam questions across 3×225 survive unchanged; every
  question resolves to a valid system key or the documented "Drug Class Study Guide" bucket.

### M3 — Real body-map + system/topic navigation
- `body_map_diagram.png` rendered at native resolution (808×1964) inside a responsive container;
  hotspots computed by scaling the 300×640-viewBox `x,y` coordinates from `systems.json`
  proportionally to rendered image dimensions (audit §F), not hardcoded pixel positions.
- 8 anatomical systems on the map; 18 non-anatomical topics (audit §C table) in a separate "More
  Topics" list screen — never forced onto the body.
- Selecting a system/topic navigates to its detail screen (description + lesson list stub for
  M4, entry points into Practice for M5).
- **Acceptance:** hotspots visually align with the real body-map artwork at 2–3 device sizes;
  tapping every one of the 8 navigates correctly; all 18 non-anatomical topics reachable from
  More Topics.

### M4 — Lesson reader
- Renders each system's `lessons[]` (`title` + `note`) as a list, linking into topic-filtered
  practice (M5). Flag to user (audit §C): no full lesson-body prose exists in the export today;
  this milestone ships the lesson *list* faithfully rather than fabricating body copy. If full
  lesson text is provided later, this becomes a straightforward content-layer swap, not a
  re-architecture.
- Lesson-completion tracking (mark-as-read) persisted via the M6 storage layer.
- **Acceptance:** all 101 lessons across 26 systems render with correct title/note; completion
  state persists across app restarts.

### M5 — QBank engine
- Single-answer, numeric, and SATA question renderers + rationale reveal, built from
  `contentRepository.getQuestions()`.
- `scoringService` ports audit §E's exact semantics: numeric tolerance-inclusive
  (`|value - correctValue| <= tolerance`), SATA exact-set match, single exact-label match.
- Works fully offline — no network call to answer a QBank question (Phase 7).
- **Acceptance:** unit tests cover all three scoring paths including SATA edge cases (partial
  selection, extra selection, order-independence) and numeric boundary values (exactly at
  tolerance, just outside).

### M6 — Offline progress
- `storage/` AsyncStorage repositories: attempts (per question: answer, correct, timestamp,
  system, domain, topic), lesson completion, onboarding name — versioned schema with a migration
  runner (Phase 9), no scattered `AsyncStorage.getItem` calls in screens.
- Accuracy/last-attempted aggregation service consumed by M8's dashboard.
- **Acceptance:** unit tests for the storage layer (write/read/migrate a v1→v2 schema bump as a
  smoke test even though only v1 ships now); attempt history survives app restart.

### M7 — Full-length exams + timer
- Exam state machine (reducer/XState) replacing the web's mutable `fixedExamState` pattern
  (audit §L): states for `not_started / in_progress / submitted`, actions for `answer(index,
  value)`, `next()`, `submit()`, `resume()`.
- Wall-clock timer (`elapsed = now - startTime`, matching the web's drift-proof approach, audit
  §E) counting down from 6 hours; auto-submits at zero.
- Since all 675 exam questions are static content (audit §K), no AI-fallback path is needed —
  simpler than the web version.
- Resume-in-progress exams; review screen after submission with per-question correct/incorrect
  and domain breakdown (1–5) using the answered-not-total percentage rule (audit §E).
- Confirmation dialog before abandoning an in-progress exam (Phase 8's "prevent accidental loss
  of progress").
- **Acceptance:** unit tests for the state machine (resume mid-exam restores exact
  index/answers/elapsed time), scoring against a fixture exam, and domain-breakdown math.

### M8 — Progress dashboard
- Per-system/topic accuracy bars, overall QBank stats, exam history/scores, domain-level
  breakdown across all attempts (not just exams) — sourced from M6's aggregation service.
- **Acceptance:** dashboard numbers match a hand-computed fixture dataset in a unit test.

### M9 — AI question integration
- Typed client for `POST /api/generate-question` only (audit §I) — sends `{messages: [...],
  max_tokens}` matching the existing backend contract exactly (model is pinned server-side, not
  sent by the client), plus the `x-access-token` header from the M10 access-token store.
- Client-side JSON-fence stripping to match the backend's expected raw-JSON response shape.
- No fallback to calling Anthropic directly (audit §I explicitly flags that pattern as broken
  and not to be replicated).
- **Acceptance:** integration test against a mocked `/api/generate-question` response; a missing/
  invalid token surfaces a clear "sign in / purchase to unlock AI practice" state rather than a
  silent failure.

### M10 — Pricing/access architecture
- Ship the **service abstraction** (`PricingService`, `AccessService`) and the researched App
  Store/Play Store IAP architecture doc (audit §P), not a working purchase button — the backend
  gap (audit §H/O.2: `create-checkout.mts` has no plan/day parameters, tokens have no expiry) is
  a prerequisite this milestone surfaces rather than silently works around.
- `PricingService.calcPrice(plan, days)` ports the exact formula (audit §H) and bundle-discount
  guarantee, used for on-device price display and eventually for validating IAP product pricing
  matches.
- `AccessService` wraps `check-access`/`verify-session` as they exist today, with an explicit
  `// TODO: token has no expiresAt yet — see audit §H` marker rather than inventing client-side
  expiry logic that the server doesn't enforce.
- **Recommend surfacing the backend gap to the user as a decision point before writing IAP
  integration code**, since it affects both platforms, not just mobile.
- **Acceptance:** pricing unit tests (formula correctness, bundle-always-cheaper invariant across
  the full 3–365 day range); documented IAP architecture reviewed with user.

### M11 — Production polish + accessibility
- VoiceOver/TalkBack labels, dynamic type support, color-contrast check against the brand
  palette (particularly amber-on-paper and the `--flag` danger color), haptics/loading states,
  error boundaries.
- **Acceptance:** accessibility audit checklist pass on both platforms.

### M12 — iOS/Android device testing
- Physical-device smoke test of the core flow (Phase 6), full exam run-through with app
  backgrounding mid-exam (verify wall-clock resume), offline QBank session with airplane mode.
- **Acceptance:** no crashes across the core flow on at least one physical iOS and one physical
  Android device; TypeScript, lint, unit tests, and Expo build all pass (Phase 14).

---

## Testing strategy (Phase 14, mapped to milestones)

| Area | Covered in |
|---|---|
| Question scoring (single/numeric/SATA) | M5 |
| Numeric tolerance boundaries | M5 |
| SATA scoring edge cases | M5 |
| Pricing formula + bundle discount | M10 |
| Progress/accuracy calculations | M6, M8 |
| Domain calculations | M2 (import), M7 (exam), M8 (dashboard) |
| Exam timing (drift-proof wall-clock) | M7 |
| Exam completion / resume | M7 |
| Local persistence + migration | M6 |
| Content loading (counts, mapping table) | M2 |

Before considering the migration complete: `tsc --noEmit`, `eslint`, full unit test suite, and
an Expo/EAS build check on both platforms — all required to pass, per Phase 14.

## Open decisions for the user (not blocking M1, but worth answering before M9/M10)

1. No mobile scaffold was ever provided — confirm M1 should proceed as a clean Expo init, or
   supply the real scaffold if one exists.
2. Lesson body content doesn't exist in the export (only title+note) — confirm M4's scope
   (lesson list linking to practice) is acceptable, or that full lesson prose is coming.
3. `create-checkout.mts` and the access-token model need plan/day/expiry fields added before
   *either* platform can charge the pricing calculator's displayed amount — confirm whether
   that's in scope for this effort or being handled separately on the web side.
4. Dark mode: the brand is built around a light "Paper" background — confirm if dark mode is
   required for launch or out of scope for M11.
