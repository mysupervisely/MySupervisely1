# M4 Implementation Notes — Production Question Engine

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`, and the M1–M3
implementation notes. Scope: one reusable Question Engine (single/numeric/SATA), a real QBank
screen built on it (sequential mode, resume, Previous/Next), and local-only progress recording.
**Exams, AI-generated questions, and payments were not built** — the engine is architected for
them (see below) but no exam/AI screen exists yet, per the explicit instruction to stop here.

## Files created

```
mobile/
  jest.setup.js                         AsyncStorage jest mock, wired into package.json's jest config
  src/
    models/
      attempt.ts                        Attempt, AttemptAnswer — local-only progress record
    services/
      scoringService.ts                 pure grading: single/numeric/SATA (+ isAnswerable gate)
      scoringService.test.ts
      questionEngine.ts                 pure reducer: the reusable Question Engine itself
      questionEngine.test.ts
    storage/
      attemptsStorage.ts                AsyncStorage-backed attempt history (real, not a stub)
      attemptsStorage.test.ts
      qbankSessionStorage.ts            AsyncStorage-backed "which question was I on" (resume)
      qbankSessionStorage.test.ts
    hooks/
      useQuestionEngine.ts              React binding for the pure reducer — source-agnostic
      useQBankSession.ts                QBank-specific wiring: resume + attempt persistence
      useSystemProgress.ts              loads+refreshes SystemProgress on screen focus
    constants/
      domains.ts                        DOMAIN_LABELS + domainLabel() — factored out of SystemScreen
    components/question/
      QuestionMeta.tsx                  "Question N of Total · System · Domain" header
      SingleAnswerOptions.tsx
      SataOptions.tsx                   3 post-submit states: chosen-correct / chosen-wrong / missed-correct
      NumericAnswerInput.tsx
      RationaleCard.tsx                 correct/incorrect banner + restated answer + real rationale text
      QuestionEngineView.tsx            composes all of the above — THE reusable engine renderer
```

Modified:
- `src/screens/qbank/QBankScreen.tsx` — real implementation (was the M1 stub).
- `src/screens/home/SystemScreen.tsx` — now uses `useSystemProgress` (async, real data) instead
  of the M3 stub's synchronous zero-fill, and the shared `domainLabel()` helper.
- `src/services/progressRepository.ts` — `questionsAnswered`/`accuracyPct` are now real
  (attempt-backed); `lessonsCompleted` stays `0` (out of scope — lesson tracking is separate).
- `src/models/index.ts` — exports the new `Attempt`/`AttemptAnswer` types.
- `mobile/package.json` — **no new dependencies added.** Only a `jest.setupFiles` entry pointing
  at `jest.setup.js` (registers `@react-native-async-storage/async-storage`'s official jest mock,
  already a project dependency since M3).

## Engine architecture

The task's architectural requirement — "Do NOT create separate question implementations for
QBank/Exams/AI. Instead create one reusable Question Engine" — is met by a strict three-layer
split:

```
services/scoringService.ts     pure grading functions, no state at all
        ↓
services/questionEngine.ts     pure reducer: EngineState + EngineAction -> EngineState
        ↓
hooks/useQuestionEngine.ts     React binding (useReducer) — still source-agnostic
        ↓
hooks/useQBankSession.ts       QBank-specific: feeds it contentRepository.getQuestions()
                                (unfiltered, sequential), wires onSubmit -> attemptsStorage,
                                wires onIndexChange -> qbankSessionStorage, and resumes on mount
        ↓
screens/qbank/QBankScreen.tsx  4 lines of actual QBank code: compose the hook + the renderer
components/question/QuestionEngineView.tsx   the renderer — reads Question + engine state,
                                              has no idea what produced the Question[] array
```

**Nothing above `useQBankSession` knows QBank exists.** `questionEngine.ts` operates on whatever
`Question[]` it's handed — the exact same `Question` discriminated union from M2's content layer,
which already carries a `source: {kind:'qbank'|'exam', ...}` tag for traceability but is never
branched on by the engine itself. `QuestionEngineView` renders `question.type` (`single`/`sata`/
`numeric`), never `question.source`. Concretely, this means:

- **Exams (M7)** get their own `useExamSession` hook — same shape as `useQBankSession` — feeding
  `useQuestionEngine` the 225 questions from `contentRepository.getExam(examNumber)` instead of
  the full QBank, wiring `onSubmit` to whatever exam-scoring/timer state M7 needs instead of
  `attemptsStorage` directly (or in addition to it — exam attempts arguably should still show up
  in the same attempt history). `QuestionEngineView` needs zero changes; all that's needed is an
  exam-flavored resume mechanism (timer + per-slot state, not just an index), matching this
  milestone's own "Resume session" pattern.
- **AI-generated questions (M9)** can hand `useQuestionEngine` a single freshly-fetched
  `Question` (or a short array), pass no `onIndexChange` at all (nothing to resume — it's
  ephemeral), and still get the identical submit/lock/rationale UI for free via
  `QuestionEngineView`. The one piece M9 will need to add is constructing a `Question` object
  from the `generate-question` API response shape (audit §I) — everything downstream of that
  already works.

## State flow

`EngineState = { questions, currentIndex, answers }`, where `answers` is keyed by `question.id`
and persists across Previous/Next navigation within a session (not just the current question) —
this is what makes "revisit an already-answered question via Previous and see it locked with its
result" work without any special-casing in the UI.

```
SELECT_SINGLE / TOGGLE_SATA / SET_NUMERIC
  -> mutates only the CURRENT question's `draft` (a no-op if that question is already 'submitted' — locked)

SUBMIT
  -> refuses if there's no draft yet, or the draft is blank/unanswerable (isAnswerable() gate — a
     business rule enforced in the reducer itself, not only via the UI disabling the Submit
     button), or the question is already submitted
  -> otherwise: scores the draft via scoreQuestion() (same pure function used everywhere),
     freezes it as `submittedAnswer`, records `isCorrect`, flips status to 'submitted'

NEXT / PREVIOUS
  -> moves currentIndex, clamped to [0, questions.length - 1]; `answers` is untouched, so a
     previously-locked question stays locked when you navigate back to it

HYDRATE
  -> the one action a caller dispatches directly (via engine.hydrate()) rather than through a
     UI interaction — used once, on mount, to restore currentIndex + answers from storage
```

The reducer never calls storage or does I/O — `useQuestionEngine` is the seam: its `submit()`
computes `isCorrect` (via the same `scoreQuestion` the reducer calls internally, so the two can't
diverge) *before* dispatching, so it can pass a real, correct value to the caller's `onSubmit`
callback without waiting for a second render to read post-dispatch state back out.

**Resume is a pure function, not React-only logic.** `buildResumeState(savedIndex, attempts,
questionsLength)` in `questionEngine.ts` does the actual "resume" computation — clamping a
possibly-stale saved index, collapsing multiple attempts per question down to the latest one,
building the locked-answer seed map — as a plain, directly unit-testable function. `useQBankSession`'s
`useEffect` is thin glue: call it, then `engine.hydrate(result)`. This was a deliberate refactor
(see "Tests added" below) specifically so "Resume functionality" could be tested thoroughly
without adding a component-testing dependency.

## Question experience

Per-question: `QuestionMeta` (number/system/domain — **no difficulty field**, see "Known
limitations"), the real stem, type-specific answer UI, and a Submit button gated by
`isAnswerable()`. After submit: options/input lock (re-selection is a no-op, enforced in the
reducer), `RationaleCard` shows a Correct/Incorrect banner, the restated correct answer(s), and
the question's real rationale text verbatim (never edited — Phase 4). SATA specifically marks a
third state beyond chosen-right/chosen-wrong: **correct-but-missed** (in `correctLabels` but
never selected), dashed-amber-outlined, so a partial-credit-looking wrong answer doesn't just say
"wrong" with no indication of what was missed — exact-set grading stays honest about *why* an
answer is wrong.

## Numeric questions

`keyboardType="decimal-pad"` for the numeric keypad (a plain text input, not a stricter
numeric-only RN input, because `decimal-pad` doesn't include a minus-sign key and some real
`correctValue`s in the content are negative — e.g. base excess/deficit calculations — so users
need to type `-` from the input's own text). Validation and tolerance checking are the same
`scoreNumeric()` used everywhere: `|value - correctValue| <= tolerance`, inclusive at both
boundaries, ported unchanged from the semantics validated in M2/the audit. `isAnswerable()` gates
the Submit button on "non-empty and parses as a number" so a student can't submit blank/garbage
input.

## SATA questions

Multiple selection via `TOGGLE_SATA` (adds/removes a label from the draft set). Scoring is exact-
set (`scoreSata` — same function validated with dedicated tests in this milestone: exact match
regardless of toggle order, partial selection, extra selection, and empty selection all handled).
Rationale is the real, unedited text from the content export.

## Progress

`attemptsStorage.ts` is real, local-only persistence (Phase: "Do not sync remotely" — there is no
network call anywhere in this file, and no plan to add one). Every submission records `id,
questionId, systemKey, domain, questionType, answer, isCorrect, attemptedAt` — everything the
task's Progress section asked for (attempts, correct/incorrect via `isCorrect`, last-attempted
via `attemptedAt`, system, domain). Kept as one append-only JSON array under a single
AsyncStorage key — simple and sufficient at QBank scale (thousands of attempts, not millions);
documented as a real M6 concern to design around properly if attempt volume ever grows large
enough to matter, not a reason to over-build a proper index now.

**This upgraded `progressRepository`'s M3 stub earlier than planned.** M3's version returned
`questionsAnswered: 0, accuracyPct: null` unconditionally, with a doc comment saying "M6 replaces
the body... without changing this function's signature." That's exactly what happened here, just
in M4 instead of M6, because M4 is what actually produces attempt data — `lessonsTotal`/
`questionsTotal` were already real in M3; `questionsAnswered`/`accuracyPct` are real now.
`lessonsCompleted` is still `0` (lesson-completion tracking is a distinct concern, still blocked
on the lesson-reader content gap from M2/M3). Accuracy is computed over each question's **most
recent** attempt, not a lifetime average of every attempt ever made — re-answering a question you
previously got wrong and getting it right now should move your accuracy, not be diluted by the
first miss forever.

## Storage decisions

- **`attemptsStorage` is real, permanent infrastructure** — not a throwaway M4-only stub. M6
  should extend it (schema versioning/migrations across the whole storage layer, alongside
  `onboardingStorage` from M3) rather than replace it.
- **`qbankSessionStorage` is deliberately minimal** — just a current index. M4 has no
  filters/randomization/bookmarks, so a single position is the entire session worth remembering.
  Exams (M7) need richer session state (timer, 225 per-slot answers) and should get their own
  storage module rather than growing exam-specific fields onto this one.
- **One JSON array per storage concern**, matching the pattern established in M3
  (`onboardingStorage`) — simple, works at today's scale, explicitly flagged where it might not
  scale forever (attempts) rather than silently assumed to.

## Tests added

101 tests total across the whole app (up from 37 after M3); everything the task asked to expand:

| Area | File | What's covered |
|---|---|---|
| Single-answer scoring | `scoringService.test.ts` | exact match, mismatch, empty |
| Numeric tolerance | `scoringService.test.ts` | both boundaries (inclusive), just outside both boundaries, zero tolerance, non-numeric input, empty input, negative values |
| SATA scoring | `scoringService.test.ts` | exact match (order-independent), partial selection, extra selection, wrong set, empty selection |
| Question state transitions | `questionEngine.test.ts` | select → submit → lock, re-selection after lock is a no-op, double-submit is a no-op, blank-draft submit is a no-op, SATA toggle accumulation/removal, numeric input after lock is frozen, Next/Previous clamping, answers surviving navigation |
| Progress recording | `attemptsStorage.test.ts`, `progressRepository.test.ts` | persists system/domain/timestamp/correctness, filters by question/system, latest-attempt-wins on re-answering, real AsyncStorage round-trip (not just in-memory), accuracy computed from latest attempts only |
| Resume functionality | `questionEngine.test.ts` (`buildResumeState`), `qbankSessionStorage.test.ts` | fresh install resumes at 0, saved index restored, out-of-range saved index clamped both directions, empty-question-list edge case, previously-answered questions come back locked with correct recorded result, re-answered questions use the latest attempt not the first, multiple different questions each seed correctly |

**Why `buildResumeState` is a standalone pure function, not tested only via the hook**: testing a
`useEffect`-driven async hook properly needs a component-rendering test harness
(`@testing-library/react-native` or similar), which isn't in this project (Phase 13's
minimal-dependencies rule, same reasoning as M3). Rather than skip testing "Resume functionality"
or add a new dependency for it, the actual resume *logic* was extracted into a plain function and
tested directly and thoroughly; the hook wrapping it is now thin enough (three lines: read
storage, call the pure function, dispatch the result) that it's low-risk without its own test.

## Known limitations

- **No "difficulty" field exists anywhere in the real content.** The task asked for "Difficulty
  (if available)" — it is not available (verified: no such field in `qbank_questions.json`,
  `exam_question_bank.json`, or `systems.json`), so `QuestionMeta` simply doesn't render one,
  rather than inventing a rating.
- **No simulator in this environment** — same constraint documented in
  `docs/demo/README.md`/`docs/screenshots/M3/README.md`. Not re-fabricated here; see
  "Build/launch verification" below for what was actually confirmed.
- **`useQuestionEngine`/`useQBankSession` have no dedicated component-level test** (see "Tests
  added" above) — covered indirectly via the pure functions they wrap, but a real render-and-
  interact test would need a new test-rendering dependency not added in this milestone.
- **Attempt storage is a single JSON blob**, fine at today's scale, a real scaling concern if
  attempt volume grows very large — flagged for M6, not solved here.
- **"Start Practice" still doesn't accept a system filter.** QBank is the full, unfiltered
  2,000-question bank in original order — this was explicitly out of scope ("Do NOT build
  filters yet"), but it means M3's already-flagged gap (SystemScreen's Start Practice button
  loses which system you came from) is still unresolved; a student tapping Start Practice from
  Cardiovascular lands in the same generic sequential QBank as tapping it from anywhere else.
- **QBank's Submit → lock → Next flow has not been visually verified** — same reasoning as prior
  milestones (see below); the logic is thoroughly unit-tested, but nobody has looked at it
  rendered on a screen.

## Build/launch verification (no simulator available — nothing fabricated)

Same environment constraint as M1–M3 (documented in full in `docs/demo/README.md`): no macOS/
Xcode, no Android SDK/emulator, no `/dev/kvm`, no device, no display. Re-confirmed rather than
assumed:

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run lint` (`eslint .`) — clean.
- `npm test` — **101/101 passing.**
- `npx expo export --platform ios` and `--platform android` — both succeed (~4.9MB Hermes
  bytecode bundles each, zero bundler errors), confirming the new engine/hooks/components/storage
  code all resolve and bundle correctly for both platforms.

**The project builds successfully.** What hasn't been confirmed — because it can't be, here — is
what the QBank screen actually looks and feels like rendered: option-tap responsiveness, keyboard
behavior on the numeric input, whether the SATA "missed" styling reads clearly, etc. Recommend a
real device/simulator run before relying on this milestone's UI being production-ready as-is.

## Recommendations for M5

1. **Get a decision on QBank filters/system-entry before M5**, even though M4 explicitly excluded
   them — `useQBankSession` currently always loads the full unfiltered bank; if M5 (or a
   pre-M5 patch) is expected to let "Start Practice" from a System screen jump into a
   system-filtered subset, that's a `useQuestionEngine({questions: contentRepository.getQuestions({systemKey})})`
   change at the call site, not an engine change — cheap now, worth deciding on purpose rather
   than drifting into.
2. **A real device/simulator pass on the QBank flow specifically** — this is the first milestone
   with real user interaction (tapping options, typing numbers, submitting) rather than mostly
   static screens; it's the highest-value thing to actually look at before building more on top.
3. **Reuse `buildResumeState`'s pattern for Exams (M7)** rather than reinventing resume logic —
   the exam engine will need its own version (probably richer: timer elapsed time alongside
   index/answers), but the "pure resume function, thin hook glue" shape proved itself worth
   keeping.
4. **Progress dashboard (M8)** now has real data to aggregate across all systems — `attemptsStorage.getAllAttempts()`
   already returns everything needed; M8 is now an aggregation/presentation problem, not a
   data-availability one.
5. Everything still outstanding from `docs/M3_QA_REVIEW.md` (hotspot contrast/overlap, missing
   hotspot selected-state, etc.) remains unaddressed and is unrelated to this milestone's scope —
   still worth a dedicated pass before/alongside M11 polish.
