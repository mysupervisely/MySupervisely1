# M6 Implementation Notes — Full-Length Exam Engine

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`, and the M1–M5
implementation notes. Scope: all three real fixed exams, a dedicated Exam Session layer (timer,
resume, flags, palette, review, submission, scoring), and local-only result storage.

## Files created

```
mobile/src/
  services/
    examSession.ts              pure exam state: reducer, timer math, palette derivation
    examSession.test.ts
    examResultService.ts        pure grading: computeExamResult (score/accuracy/breakdowns)
    examResultService.test.ts
  models/
    examResult.ts                ExamResult, DomainBreakdown, SystemBreakdown
  storage/
    examSessionStorage.ts        the LIVE in-progress session (per exam number)
    examSessionStorage.test.ts
    examResultsStorage.ts        permanent history of completed attempts (append-only)
    examResultsStorage.test.ts
  hooks/
    useExamSession.ts             the dedicated ExamSession layer's React binding
    useExamTimer.ts                ticking display hook, wall-clock derived
    useExamResult.ts               loads one stored ExamResult by id
    useExamListStatuses.ts         real per-exam status (not started/in progress/completed) for the hub screen
  components/exam/
    PaletteGrid.tsx                the 225-cell jump-to grid (FlatList-backed — see Performance)
    QuestionPalette.tsx            modal wrapper around PaletteGrid, opened from ExamTakingScreen
  screens/exam/
    ExamListScreen.tsx             hub: 3 exams, real status, Start/Resume/View Results/Retake
    ExamTakingScreen.tsx           the exam itself: timer, question, flag, prev/next, palette
    ExamReviewScreen.tsx           review before submission: stats + palette + confirm-and-submit
    ExamResultsScreen.tsx          score, accuracy, domain/system breakdown, flagged/incorrect summary
  navigation/
    ExamStackNavigator.tsx         ExamList -> ExamTaking -> ExamReview -> ExamResults
  utils/
    formatDuration.ts               HH:MM:SS for the countdown
    formatDuration.test.ts
```

Modified:
- `src/navigation/types.ts` — added `ExamStackParamList`; `MainTabParamList.ExamTab` changed
  from `undefined` to `NavigatorScreenParams<ExamStackParamList>`. `examNumber` is typed as the
  real `ExamNumber` (`1|2|3`) from the start, unlike `systemKey` (still deferred to `string`) —
  the set of exams is small, fixed, and fully known, so there's no equivalent reason to wait.
- `src/navigation/MainTabNavigator.tsx` — `ExamTab` now points at `ExamStackNavigator` instead of
  the M1-era flat `ExamScreen` (deleted).
- `src/models/index.ts` — exports the new `ExamResult`/`DomainBreakdown`/`SystemBreakdown` types.

**No new dependencies added** — the confirmation dialog uses React Native's built-in `Alert`, the
palette modal uses the built-in `Modal`.

## Exam architecture

The task is explicit: **"Create a dedicated ExamSession layer. Do not reuse the QBank session
directly. Reuse the Question Engine."** That's three separate instructions, and they pull in
different directions once you look at what "the Question Engine" actually contains — so here's
exactly what was reused, what wasn't, and why.

**What IS reused from the Question Engine (M4):**
- `scoreQuestion()` and `isAnswerable()` from `scoringService.ts` — completely unchanged. Exam
  grading uses the exact same single/SATA/numeric scoring rules as QBank.
- `emptyDraftFor()` from `questionEngine.ts` — the same "what does a blank answer look like for
  this question type" helper.
- The `AttemptAnswer` type itself (`{type:'single', label}` / `{type:'sata', labels}` /
  `{type:'numeric', text}`) — exams capture answers in the identical shape QBank does.

**What is NOT reused: `questionEngine.ts`'s reducer/`EngineState`, or `QuestionEngineView`.**
M4's own implementation notes assumed `QuestionEngineView` "needs zero changes" for exams — that
assumption doesn't survive contact with real exam semantics. QBank's engine locks a question the
moment you submit it and immediately reveals the rationale and correct answer
(`SingleAnswerOptions`/`SataOptions`/`NumericAnswerInput` all render a "correct/incorrect" state
right after `SUBMIT`). A NAPLEX-style exam does the opposite: **you can revisit and change any
answer, on any question, at any time before final submission — nothing is ever revealed until
the whole exam ends.** Because the per-question state shape genuinely differs (QBank needs
`status: 'unanswered'|'submitted'` + a frozen `submittedAnswer` + `isCorrect` per question, live,
during the session; an exam needs none of that until the very end), forcing exam state through
`questionEngine.ts`'s reducer would have meant either dispatching a `SUBMIT` per question (wrong
— reveals the answer mid-exam) or leaving every question permanently `'unanswered'` and inventing
a parallel way to track "is this actually filled in" (which is what `examSession.ts` does
directly and honestly, instead of fighting the QBank reducer's assumptions).

So `examSession.ts` is its own reducer (`examSessionReducer`), with its own `ExamSessionState`
and `ExamSessionAction` types — genuinely "a dedicated ExamSession layer," not a re-skin of
`useQBankSession.ts`. It reuses the option-rendering *components* from M4
(`SingleAnswerOptions`/`SataOptions`/`NumericAnswerInput`) by always passing `isLocked={false}`
and no `correctLabel` — those components already supported an "unlocked, no reveal" mode, they
just had never been exercised that way before.

## State machine

```
ExamSessionState = {
  examNumber, questions (in-memory only, never persisted — see Persistence),
  currentIndex, answers: Record<questionId, AttemptAnswer>,
  flaggedQuestionIds: string[],
  startedAt (ISO, the timer's wall-clock anchor), durationSeconds,
  status: 'in_progress' | 'submitted', submittedAt?
}
```

Actions: `SELECT_SINGLE` / `TOGGLE_SATA` / `SET_NUMERIC` (mutate the current question's answer —
no lock check, unlike QBank, since exam answers are always revisable pre-submission),
`NEXT`/`PREVIOUS`/`JUMP_TO` (navigation — `JUMP_TO` is what the palette uses to jump directly to
any of the 225 questions), `TOGGLE_FLAG` (flags the *current* question — independent of whether
it's answered), `SUBMIT_EXAM` (grades nothing itself — just flips `status`/`submittedAt`; actual
grading is `examResultService.computeExamResult()`, a separate pure function, called once by the
hook right after), and `HYDRATE` (wholesale state replacement, used only by `useExamSession` to
restore a loaded-from-storage or freshly-created session — never dispatched by a screen mid-exam).

**A submitted exam is fully immutable**: every mutating action is a no-op once
`status === 'submitted'` (checked once, at the top of the reducer, before the switch) — verified
by a dedicated test that every single action type is rejected post-submission.

## Timer implementation

The countdown is **derived, never stored as a literal number.** `computeRemainingSeconds(startedAt,
durationSeconds, now) = durationSeconds - max(0, now - startedAt)`. This is what makes "continue
after app restarts" true for free: only `startedAt` (written once, at exam creation) needs to
persist — there's no per-second countdown value to keep in sync, and backgrounding/killing the
app can't desync anything because the next read just recomputes from the wall clock.

**"Prevent time manipulation where practical"** — this is genuinely limited, and the limits are
worth stating plainly rather than glossing over:
- **What this defends against**: backgrounding the app, killing it, or letting a JS `setInterval`
  drift/pause (common ways a naive "count down from N" timer gets exploited or just breaks) — none
  of these affect the wall-clock-derived value at all.
- **What this defends against, partially**: rolling the device clock *backward* to manufacture
  extra time. `elapsed` is clamped to `>= 0` (`Math.max(0, now - startedAt)`), so a clock rolled
  backward past `startedAt` can't produce more than the full `durationSeconds` — verified by a
  dedicated test (`"rolling the clock BACKWARD cannot manufacture extra time"`).
- **What this does NOT defend against**: a sufficiently deliberate attacker rolling the clock
  *forward* to force early expiry then *back* to resume with time "banked," or any form of time
  manipulation validated only by a trusted server — which a fully offline app doesn't have. Real
  tamper-resistance for a timed exam ultimately requires a server-issued, server-verified
  timestamp; that's out of scope for an offline-first app and is the honest boundary of "where
  practical" here.
- **Double-checked at two points, not just live**: `useExamTimer` ticks every second while
  `ExamTakingScreen` is mounted and calls `onExpire` the first time remaining hits 0 (triggering
  submission). Separately, `useExamSession`'s load effect checks `isExpired()` against whatever
  session was loaded from storage *before* hydrating it — so an exam that blew past its 6-hour
  window while the app was closed gets submitted the moment its screen is reopened, not silently
  resumed as if time had stopped. Both paths funnel through the same `submitExam()`.

## Persistence

Two separate storage concerns, deliberately not merged:

- **`examSessionStorage`** — the LIVE, in-progress session. Persists `currentIndex`, `answers`,
  `flaggedQuestionIds`, `startedAt`, `durationSeconds`, `status` — explicitly **not**
  `questions`. A 225-question exam's content is several hundred KB of real stem/option/rationale
  text; that's static content already available from `contentRepository.getExam()`, so
  re-serializing it into AsyncStorage on every answer/navigation would be pure waste.
  `PersistedExamSession`/`ExamSessionState` are two distinct types precisely to make this
  omission structural (`toPersisted()`/`fromPersisted()`), not something a screen could
  accidentally get wrong by persisting the wrong object.
- **`examResultsStorage`** — the permanent, append-only history of graded results, independent
  of the live session. A student can retake an exam; each submission adds a new `ExamResult`
  rather than overwriting the last one, so `ExamListScreen`'s "Last score: X%" and a future
  results-history view both stay possible.

**Debounced writes, not per-keystroke.** Exam interactions include per-keystroke numeric input
(unlike QBank's per-action `onSubmit`/`onIndexChange` callbacks from M4, which fire at a much
lower frequency). Persisting on every single state change would mean an AsyncStorage write per
character typed into a numeric answer. `useExamSession` instead debounces persistence 400ms after
the last state change. **Tradeoff, stated plainly**: if the app is killed within that 400ms
window, the very last keystroke/action might not have been saved — worst case, resuming shows the
state as of ~400ms before the kill (e.g. needing to re-type the last character or two of a
numeric answer). Navigation/flag/select actions are far less frequent than typing, so in practice
this mostly matters for numeric questions specifically.

## Question palette

`getPaletteEntries()` (pure, in `examSession.ts`) returns one entry per question:
`{index, questionId, isAnswered, isFlagged, isCurrent}` — **the three visual states are
independent booleans, not a mutually-exclusive enum.** A question can be both answered and
flagged at once (a real, common case — "I answered this but want to double-check it"), so
forcing a single "status" value per cell would have lost information the task explicitly asked
to distinguish. `PaletteGrid` renders answered as a filled background, flagged as an amber
border, current as a dark border — all layerable on the same cell.

`PaletteGrid` is reused in two places: `QuestionPalette` (a `Modal`, opened from
`ExamTakingScreen` for a quick jump without leaving the question) and `ExamReviewScreen`
(embedded directly as the review screen's main content, via a `headerContent` slot for the
stats/submit-button block — see Performance below for why this isn't nested inside another
scroll container).

## Results

`computeExamResult()` (pure, `examResultService.ts`) grades every question once, at submission,
and produces:
- **Score** (`correctCount / totalQuestions`, e.g. "180/225 correct, 80%") — the classic raw-score
  framing, an addition not present in the web app.
- **Accuracy** (`correctCount / answeredCount`) — the **exact rule from
  `docs/MOBILE_MIGRATION_AUDIT.md` §E**, preserved unchanged: unanswered questions are excluded
  from the denominator, not counted as wrong. This is an established business rule from the real
  web app, not something this milestone gets to redefine (Phase 13).
- **Domain breakdown** (all 5 domains, even ones with 0 questions in a given exam slice — though
  in practice every domain appears in all 3 real exams) and **system breakdown** (only systems
  actually present in that exam, sorted alphabetically) — both use the same answered-based
  accuracy rule as the overall score.
- **Flagged questions summary** and **incorrect questions summary** — real question numbers
  (`Q47`, not the internal `exam-1-46` id), resolved from each question's actual
  `source.slot` via `contentRepository.getQuestionById()` (the same cross-source lookup fixed in
  M5), never fabricated.

## Performance considerations

- **`PaletteGrid` uses `FlatList`, not `.map()` in a `ScrollView`** — unlike the app's smaller
  lists (27 systems, 19 topic cards), 225 cells is large enough that virtualization genuinely
  matters. **Caught and fixed before it shipped**: an early draft nested `PaletteGrid`'s `FlatList`
  inside `ExamReviewScreen`'s outer `ScrollView` with `scrollEnabled={false}` — a well-known
  anti-pattern that silently defeats virtualization entirely (a non-scrolling `FlatList` inside a
  `ScrollView` has to render every row up front so the outer scroll has something to measure).
  Fixed by giving `PaletteGrid` a `headerContent` slot so screen-level header content (title,
  stats, Submit button) renders *through* `FlatList`'s own `ListHeaderComponent`, keeping the
  `FlatList` as the one and only scroll owner wherever it's used.
- **Timer ticks are O(1) per second** — `computeRemainingSeconds()` does a single subtraction, no
  iteration; re-render cost is one `Text` node's content changing, not a re-aggregation of
  anything.
- **Debounced persistence** (see above) is as much a performance decision as a correctness one —
  bounds AsyncStorage write frequency during rapid typing.
- **`questions` never gets re-serialized** (see Persistence) — the single biggest avoidable cost
  this milestone could have introduced, avoided structurally rather than by convention.
- **`examSessionReducer`/`computeExamResult` are pure and allocate small, flat objects** — no
  hidden O(n²) behavior scanning 225 questions repeatedly; each grading pass is a single O(n)
  walk (`computeExamResult`'s domain/system breakdowns each do one more O(n) pass, so grading a
  full exam is a small constant number of O(225) passes, not something that scales badly).

## Tests added

182 tests total across the app (up from 131 after M5); every area the task asked to expand:

| Area | File | What's covered |
|---|---|---|
| Timer behavior | `examSession.test.ts` (`computeRemainingSeconds`, `isExpired`) | full duration at start, counts down correctly, exact boundary at 0 (not negative), stays at 0 past the boundary, backward-clock manipulation clamped, "app restart" scenario (remaining derived purely from `startedAt` + `now`) |
| Resume | `examSession.test.ts` (`toPersisted`/`fromPersisted`), `examSessionStorage.test.ts`, `useExamSession`'s expiry-on-load logic (exercised via the pure `isExpired`/`examSessionReducer` functions it composes) | persisted shape excludes `questions`, round-trips current index/answers/flags correctly, each exam number stored independently, resuming an EXPIRED session (covered structurally via `isExpired` + `SUBMIT_EXAM` reducer tests, since the hook-level orchestration itself isn't unit-tested — see Known Limitations) |
| Submission | `examSession.test.ts` | flips status + records `submittedAt`, and — critically — a submitted exam rejects every single mutating action type (answers, navigation, flags) |
| Scoring | `examResultService.test.ts` | unanswered-exam edge case (no 0/0 division), accuracy computed over ANSWERED questions only (the audit's rule) vs. the additive raw "score" over the full total, a fully-correct exam scoring 100/100 |
| Review state | `examSession.test.ts` (`answeredCount`, `isQuestionAnswered`) | a blank draft (selected then cleared) still counts as unanswered, answered count reflects real answerable drafts across the whole exam |
| Flagged questions | `examSession.test.ts` | flag/unflag the current question, flags persist independently per question, flagging is independent of answering (a flagged-but-unanswered question is valid), `examResultService.test.ts`'s `flaggedQuestionIds` passthrough test |
| Question palette state | `examSession.test.ts` (`getPaletteEntries`) | answered/flagged/current computed independently and correctly per question, in the right order |

**Not unit-tested at the hook level** (`useExamSession`, `useExamTimer`, `useExamListStatuses`) —
same reasoning as M4/M5: these are thin orchestration layers around thoroughly-tested pure
functions (`examSessionReducer`, `computeRemainingSeconds`, `computeExamResult`), and testing
React hooks with real timers/effects properly needs a component-rendering test dependency not
added in this project (Phase 13's minimalism rule, consistent with every prior milestone's
docs). Flagged again below as a recurring, deliberate tradeoff.

## Known limitations

- **No simulator in this environment** — same constraint as M1–M5, documented in
  `docs/demo/README.md`. Nothing fabricated; see "Build/launch verification" below.
- **Hook-level orchestration is untested** (see above) — the pure logic each hook wraps is
  thoroughly tested, but the actual `useEffect` sequencing (load → maybe-auto-submit-if-expired →
  hydrate → debounced persistence) has not been exercised end-to-end in a test, only reasoned
  through and covered piecewise via its constituent pure functions.
- **Clock-manipulation resistance is partial, by design** — see the Timer section's honest
  accounting of exactly what "where practical" does and doesn't cover.
- **No AI-generated fallback for any exam slot** — unnecessary, since all 675 real exam questions
  (225 × 3) are fully authored content (confirmed in the original audit); this isn't a gap, just
  worth restating since the web app's own exam engine had defensive AI-fallback code for
  slots that, in practice, are never actually empty.
- **A retaken exam's PREVIOUS in-progress session state (if any) is discarded on Retake** (via
  `examSessionStorage.clear()`), by design — but there's no confirmation dialog on Retake itself
  the way there is on Submit; tapping Retake on a completed exam immediately clears and restarts.
  Worth a confirmation dialog in polish if this proves surprising in practice.
- **The exam-taking UI has not been visually verified** — same reasoning as every prior
  milestone; the state machine and scoring are thoroughly unit-tested, but nobody has looked at
  the timer header, the palette grid, or the review screen actually rendered.

## Build/launch verification (no simulator available — nothing fabricated)

Same environment constraint as M1–M5 (full explanation in `docs/demo/README.md`): no macOS/
Xcode, no Android SDK/emulator, no `/dev/kvm`, no device, no display.

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run lint` (`eslint .`) — clean (caught and fixed two real issues along the way: a
  ref-mutated-during-render pattern in both new timer-adjacent hooks, flagged by a newer
  `react-hooks/refs` rule, fixed by moving the ref sync into an effect; and a
  `setState`-synchronously-in-effect pattern in `useExamResult`, fixed by removing a redundant
  call).
- `npm test` — **182/182 passing.**
- `npx expo export --platform ios` and `--platform android` — both succeed (~5.0MB Hermes
  bytecode bundles each, zero bundler errors).

**The project builds successfully.** What hasn't been confirmed is what the exam-taking
experience actually feels like rendered — timer legibility, palette scroll performance on a real
device at 225 cells, whether the review screen's embedded grid reads clearly. Recommend a real
device/simulator pass before relying on this milestone's UI being production-ready as-is, same
recommendation as every prior milestone.

## Recommendations for M7

1. **A real device pass on the exam flow is the highest-value next step**, more so than prior
   milestones — this is the first genuinely long-running, stateful flow (up to 6 hours, backgrounding,
   resuming) rather than a screen that's mostly correct-by-construction from short interactions.
2. **Consider adding a lightweight hook-level test harness** (even without a full
   `@testing-library/react-native` investment) if M7/M8 keep adding hook orchestration — three
   milestones in a row now have flagged "the hooks themselves aren't tested" as an accepted
   tradeoff; at some point the aggregate untested surface area is worth revisiting as a decision,
   not re-deferring by default.
3. **Retake confirmation** — small, cheap UX fix flagged above, worth picking up whenever the
   next polish pass happens.
4. **Historical exam-results list** — `examResultsStorage` already supports multiple attempts per
   exam (`getResultsForExam`), but no screen currently lists past attempts beyond "latest score"
   on the hub — a natural, low-effort addition whenever a "my exam history" view is wanted.
5. Everything still outstanding from `docs/M3_QA_REVIEW.md` remains unaddressed and unrelated to
   this milestone's scope.
