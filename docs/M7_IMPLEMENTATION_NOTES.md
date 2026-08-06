# M7 Implementation Notes — Performance Analytics + Learning Loop

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`, and the
M1–M6 implementation notes. Scope: turning the completed M6 exam simulator into a learning
system — post-exam results/review, weakness detection, recommended study sessions, a readiness
score, exam history, and an instructor-analytics data foundation (no UI).

No existing M6 (or earlier) architecture was rewritten. Every change to a pre-M7 file is
additive — a new field, a new optional prop, a new exported function — never a rename, removal,
or behavior change to something that already worked. Each section below says explicitly what was
touched and why.

## Files created

```
mobile/src/
  constants/
    analyticsConfig.ts                 every M7 threshold/weight, named — see "Constants" below

  services/
    weaknessDetectionService.ts        M7.4: combined QBank+exam domain performance, weak/strong/risk
    weaknessDetectionService.test.ts
    recommendationService.ts           M7.5: domain + recent-misses study recommendations
    recommendationService.test.ts
    readinessScoreService.ts           M7.6: "PharmDPrepped Readiness Score" — see "Readiness Score" below
    readinessScoreService.test.ts
    instructorAnalyticsService.ts      M7.8: computeStudentAnalyticsSnapshot (pure, no storage)
    instructorAnalyticsService.test.ts

  models/
    studentAnalyticsSnapshot.ts        M7.8: StudentAnalyticsSnapshot type — see "Instructor Analytics Foundation"

  hooks/
    useStudyRecommendations.ts         loads attempts+examResults, derives weaknessReport+recommendations
    useStudySession.ts                 thin QBank-pattern wiring around useQuestionEngine for a recommendation
    useExamHistory.ts                  loads examResults, derives history via examResultService.computeExamHistory

  screens/
    exam/ExamQuestionReviewScreen.tsx  M7.3: read-only post-exam question review
    progress/StudyRecommendationsScreen.tsx  M7.5: list of recommendations
    progress/StudySessionScreen.tsx          M7.5: a recommendation turned into a live session
    progress/ExamHistoryScreen.tsx           M7.7: every completed exam attempt + improvement trend

  components/progress/
    ReadinessScoreCard.tsx             M7.6: score + component breakdown, shown on the Progress dashboard

  navigation/
    ProgressStackNavigator.tsx         M7: Progress -> StudyRecommendations -> StudySession, Progress -> ExamHistory
```

## Files modified (all additive)

- `src/models/examResult.ts` — added `ExamResultQuestionAnswer` type and, on `ExamResult`:
  `incorrectCount`, `unansweredCount`, `totalTimeSpentSeconds`, `averageTimePerQuestionSeconds`,
  `questionAnswers`. Added `answered: number` to `DomainBreakdown`/`SystemBreakdown` (was computed
  internally and discarded before M7; now exposed because M7.4 needs real answered/correct counts
  per domain, not just a rounded percentage). No M6 field renamed or removed — `examNumber`
  already serves as this record's "examId" and `submittedAt` as its "completedAt"; the M7.1 spec's
  field names map onto the existing M6 fields rather than duplicating them under new names.
- `src/services/examResultService.ts` — `computeExamResult()` now populates every new field above
  from real session data; added `getReviewPaletteEntries()` (M7.3) and `computeExamHistory()`
  (M7.7), both pure functions operating on stored `ExamResult`s.
- `src/services/progressAnalyticsService.ts` — added `correctCount: number` to `DomainStat`
  (alongside the existing `accuracyPct`), for the same reason as `DomainBreakdown.answered` above:
  `weaknessDetectionService.ts` needs raw counts to correctly combine QBank and exam domain
  performance, not a rounded percentage it would have to reverse-engineer.
- `src/services/examSession.ts` — added an optional `isIncorrect?: boolean` field to `PaletteEntry`.
  Always `undefined` from the live-exam `getPaletteEntries()` (a live exam never has correctness
  feedback — that rule is unchanged); only ever set by `examResultService.getReviewPaletteEntries()`
  for the post-exam review palette, where correctness is real and permanent.
- `src/components/exam/PaletteGrid.tsx` — renders an "Incorrect" cell state + legend entry when
  any entry has `isIncorrect: true`; a no-op for every pre-M7 caller (`QuestionPalette` during a
  live exam, `ExamReviewScreen`'s pre-submission review), since they never set that field.
- `src/components/question/RationaleCard.tsx` — added an optional `isAnswered?: boolean` prop
  (default `true`). When explicitly `false`, renders a neutral "Not Answered" banner instead of
  "Correct"/"Incorrect" — needed because M7.3's review screen must not claim an unanswered
  question was answered wrong. Every pre-M7 call site is unaffected without passing anything new.
- `src/screens/exam/ExamResultsScreen.tsx` — added Time Used / Avg Time-per-Question stat tiles, a
  Question Breakdown block (correct/incorrect/unanswered/flagged counts), a "Review Questions"
  button into the new M7.3 screen, and reworked `BreakdownRow` to show "N questions attempted / N
  correct" (the M7.2 spec's literal example format) alongside the existing accuracy bar.
- `src/hooks/useProgressDashboard.ts` — now also loads `examResultsStorage` results and exposes a
  `readiness: ReadinessResult | null` field (M7.6), computed via the same memoization pattern as
  every other dashboard stat.
- `src/screens/progress/ProgressScreen.tsx` — now a screen nested inside `ProgressStackNavigator`
  (composite navigation type, same pattern `SystemScreen.tsx` already used for cross-tab
  navigation); renders `ReadinessScoreCard` and links into Recommended Study / Exam History.
- `src/navigation/types.ts` — added `ExamQuestionReview` to `ExamStackParamList`; added the new
  `ProgressStackParamList`; `MainTabParamList.ProgressTab` changed from `undefined` to
  `NavigatorScreenParams<ProgressStackParamList>` (Progress was a flat tab screen through M6 —
  M7.5/M7.7 gave it real nested destinations).
- `src/navigation/ExamStackNavigator.tsx` — registers `ExamQuestionReviewScreen`.
- `src/navigation/MainTabNavigator.tsx` — `ProgressTab` now points at `ProgressStackNavigator`
  instead of the flat `ProgressScreen`.
- `src/models/index.ts` — exports the new `StudentAnalyticsSnapshot` type.

**No new dependencies added.** Everything in M7 is composed from React Navigation, React Native
core components, and AsyncStorage — all already in the project since earlier milestones.

## M7.1 — Exam Results Experience

"Results must be generated from actual exam session data. No hardcoded values." Every new
`ExamResult` field is computed in `computeExamResult()` directly from the just-submitted
`ExamSessionState` — there is no default/placeholder value anywhere in that function:

- `incorrectCount` / `unansweredCount` — real counts, kept internally consistent
  (`answeredCount + unansweredCount === totalQuestions`, `incorrectCount ===
  incorrectQuestionIds.length`), asserted by tests.
- `totalTimeSpentSeconds` — wall-clock seconds between `state.startedAt` and `state.submittedAt`,
  clamped to `>= 0` (defends the same "don't trust the clock" concern M6's timer math already
  handled, for the rare case a corrupt/rolled-back device clock makes `submittedAt < startedAt`).
  This is total elapsed time, **not** a measure of active/focused attention — the app has no
  per-question dwell-time instrumentation, so it can't claim otherwise.
- `averageTimePerQuestionSeconds` — `totalTimeSpentSeconds / totalQuestions`, an exam-wide pacing
  average (matching the real NAPLEX's own "hours / 225 questions" framing), not a true
  per-question measurement, for the same reason as above.
- `questionAnswers` — one `ExamResultQuestionAnswer` per question, in exam slot order, built in
  the same single pass `computeExamResult()` already made over `state.questions` (no second loop).

## M7.2 — Results Dashboard UI

Extended `ExamResultsScreen.tsx` (not rewritten): the pre-existing score/accuracy tiles and
domain/system breakdown are unchanged in structure. Added:

- Time Used / Avg Time-per-Question tiles, formatted with the existing `formatDuration()` (HH:MM:SS).
- A Question Breakdown block: four tiles (Correct / Incorrect / Unanswered / Flagged), each a
  direct field on `ExamResult` — no re-derivation, no fabricated numbers.
- `BreakdownRow` (used for both domain and system breakdown) now shows "N questions attempted / N
  correct" as its own caption line, matching the M7.2 spec's literal example format ("Cardiology /
  18 questions / 15 correct / 83%"). One clarification worth being explicit about: the spec's
  example uses a system name ("Cardiology"), and this app's data model — established back in
  M3/M5 — draws a real distinction between NAPLEX **domains** (1–5, no proper names in the source
  content, displayed as "Domain 1".."Domain 5") and **systems** (Cardiology, Dermatology, etc.,
  real names from the content export). Both breakdowns are shown, each correctly labeled for what
  it actually is — domain numbers for domains, real system names for systems — rather than
  inventing domain names the content doesn't have.
- A "Review Questions" button into the new M7.3 screen.

Every number displayed comes from a field already computed in M7.1 — no domain/system is shown
with a fabricated accuracy, and domains/systems with `total: 0` in a given exam still render (with
`—` for accuracy), matching the existing M6 behavior of showing all 5 domains regardless of
whether that exam actually tested each one.

## M7.3 — Question Review After Exam

`ExamQuestionReviewScreen.tsx` is read-only end to end: it renders `SingleAnswerOptions` /
`SataOptions` / `NumericAnswerInput` with `isLocked` always `true` and no-op
`onSelect`/`onToggle`/`onChangeText` callbacks (the prop shape requires them, but nothing ever
calls back into a mutation). It reads exclusively from the permanent `ExamResult` (via
`useExamResult`), **never** from the live `ExamSessionState` — there is no code path in this
screen that can touch a completed exam's stored answers. "Exam behavior changes after completion
only... Maintain immutability of completed exams" is enforced the same way it already was at the
`examSession.ts` reducer level (every mutating action is a no-op once `status === 'submitted'`);
this screen simply never has a reducer to dispatch into in the first place.

An unanswered question's `RationaleCard` shows "Not Answered" rather than "Incorrect" (the new
`isAnswered` prop, see above) — showing "Incorrect" for a question the student never touched would
misrepresent what happened.

Navigation between questions reuses the same jump-to-question palette pattern as the live exam
(`QuestionPalette` + `PaletteGrid`), fed by the new `getReviewPaletteEntries()` — which also
surfaces `isIncorrect` per cell, something a live exam's palette structurally can never show (no
correctness exists pre-submission).

## M7.4 — Weakness Detection Engine

`weaknessDetectionService.ts` combines two already-real data sources — QBank accuracy
(`attemptsStorage`, via `progressAnalyticsService.computeDomainStats`) and exam accuracy
(`examResultsStorage`, via each `ExamResult.domainBreakdown`) — into one per-domain
answered/correct total (`computeDomainPerformance`). A domain's `hasSignal` flag requires
`answered >= analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL` (5); everything downstream (weak/strong/risk
ranking, M7.5's recommendations) only ever looks at signal-eligible domains — a domain with 1
question and 0% accuracy is real data, but not a reliable *signal*, and is never shown as if it
were one.

- **Weak domains**: the `analyticsConfig.WEAK_DOMAIN_COUNT` (3) lowest-accuracy signal-eligible
  domains.
- **Strong domains**: the `analyticsConfig.STRONG_DOMAIN_COUNT` (3) highest-accuracy signal-eligible
  domains.
- **Risk domains**: *every* signal-eligible domain at or below `analyticsConfig.RISK_DOMAIN_THRESHOLD_PCT`
  (65%) — independent of the weak-domain ranking (a student could have 0 risk domains, or more
  than 3 — tested explicitly).

## M7.5 — Recommended Study Sessions

`recommendationService.ts` produces two kinds of `StudyRecommendation`, each carrying real
`questionIds` resolved through `contentRepository` — this is what "must link back into existing
QBank/question engine" means concretely: a screen turns a recommendation into a live session with
`questionIds.map(contentRepository.getQuestionById)` and nothing else.

- **Recent misses**: a question counts as a *current* miss only if the student's most recent
  interaction with it — the latest QBank attempt, or its outcome in the most recent exam result
  that included it — was answered-and-wrong. A question later fixed on retry stops counting; this
  is "what's still wrong right now," not a lifetime miss log. Capped at
  `RECENT_MISSES_LOOKBACK_COUNT` (50) candidates, most-recent-first, then
  `RECOMMENDED_SESSION_QUESTION_COUNT` (20) are actually offered.
- **Domain recommendations**: one per domain in `weakDomains ∪ riskDomains` (a domain in both gets
  one recommendation, tagged `risk-domain` — the stronger claim), sorted lowest-accuracy-first,
  each pulling up to 20 real QBank questions from that domain via `contentRepository.getQuestions({domain})`.

`useStudySession.ts` is the thin, source-specific hook `useQBankSession.ts` established the
pattern for: compose `useQuestionEngine` with this source's own persistence, don't touch the
engine itself. Two deliberate differences from QBank:

1. Questions come from a caller-supplied id list instead of the full bank.
2. **No session-position persistence.** A recommended session is generated fresh from *current*
   weaknesses every time it's opened — it's not a resumable, permanent queue like QBank or an
   exam. If a student answers 8 of 20 recommended questions and leaves, reopening
   "Recommended Study" recomputes recommendations from whatever's still weak at that moment
   (which may no longer include the same 20 questions). This is an intentional scope line, not an
   oversight: building persistent-queue semantics for a session whose entire point is "always
   reflect current weakness" would fight its own purpose. Submitted answers **are** still recorded
   to `attemptsStorage` exactly like QBank, so a partially-completed recommended session still
   contributes to future recommendations and progress stats — nothing about answering a
   recommended question is a second-class, untracked action.

## M7.6 — Readiness Score

`readinessScoreService.ts` computes the **"PharmDPrepped Readiness Score"** — that exact label is
used everywhere it's surfaced (`ReadinessScoreCard.tsx`'s title, the service's own doc comments).
It is explicitly **not** a NAPLEX pass/fail prediction; the card's subtitle states that directly,
and no code anywhere frames it as one.

Four weighted components (`analyticsConfig.READINESS_WEIGHTS`, summing to 1.0):

| Component | Weight | What it measures |
|---|---|---|
| Exam Performance | 0.35 | Average `accuracyPct` across each distinct exam's most recent attempt |
| QBank Accuracy | 0.25 | Overall QBank accuracy (latest attempt per question, all-time) |
| Question Volume | 0.20 | Unique QBank questions answered, as a % of `READINESS_FULL_VOLUME_QUESTION_COUNT` (500), capped at 100 |
| Domain Coverage | 0.20 | Signal-eligible domains (via `weaknessDetectionService`), as a % of all 5 |

`score = round(Σ component × weight)`, so it's always 0–100 (each component is independently
capped at 100 first).

"Recent trends" (from the spec) is reported as a separate `trend` field
(`'improving' | 'declining' | 'stable' | 'insufficient-data'`), **not** folded into the weighted
score — it compares the two most recent exam results' `accuracyPct` by submission date (regardless
of exam number, since a student may not retake the same exam back-to-back), with a
`READINESS_TREND_DELTA_PCT` (5-point) minimum swing to call it a real trend rather than noise.
Fewer than 2 exam results means `'insufficient-data'`, shown as-is rather than a fabricated
"stable."

Displayed inline on the Progress dashboard (`ReadinessScoreCard`), which also breaks down each of
the 4 components as its own mini progress bar — a student can see *why* their score is what it is,
not just the number.

## M7.7 — Exam History

`computeExamHistory()` (in `examResultService.ts`, alongside the rest of the `ExamResult`-derived
pure functions) sorts every stored result most-recent-first and tags each with
`improvementDeltaPct`: that attempt's `accuracyPct` minus the **previous attempt of the same exam
number** — not the previous attempt overall. Comparing Exam 1 against a different exam (Exam 2,
which could be structurally harder or easier) would be a meaningless "improvement" number; each
exam's trend is only ever measured against its own history. `null` for an exam's first-ever
attempt.

`ExamHistoryScreen.tsx` lists every attempt with date, score, and the improvement line (↑/↓/"no
change"/"First attempt"), and taps through into the existing `ExamResultsScreen` for that specific
result (cross-tab navigation, `ExamTab` → `ExamResults`, same composite-navigation-prop pattern
`SystemScreen.tsx` already established for jumping tabs).

## M7.8 — Instructor Analytics Foundation

"Prepare architecture for instructor dashboard. Do not build full instructor accounts yet." This
app has no accounts or multi-student concept at all — so M7.8 is deliberately data-shape-only,
with **no UI, no storage module, and no student-picker**:

- `StudentAnalyticsSnapshot` (`src/models/studentAnalyticsSnapshot.ts`) — a plain,
  JSON-serializable type (`schemaVersion`, `studentId`, `generatedAt`, `examsCompleted`,
  `averageScorePct`, `weakDomains`, `questionVolume`, `lastActivityAt`). No class instances, no
  `Date` objects (ISO strings throughout) — "keep compatible with future cloud sync" means nothing
  here assumes a particular storage/transport, and `schemaVersion` exists so a future sync
  consumer can detect and migrate an older cached snapshot instead of misreading it.
- `computeStudentAnalyticsSnapshot(studentId, attempts, examResults)` — pure, in
  `instructorAnalyticsService.ts`, reusing `computeWeaknessReport` and `computeOverallStats` (no
  new aggregation logic duplicated from M5/M7.4).
- **Deliberately no storage module.** A snapshot is always computed fresh from
  `attemptsStorage`/`examResultsStorage` — the real source of truth — never cached as a second,
  driftable copy. When real accounts/a backend exist, the same pure function is what would run
  (server-side per student, or locally with results synced up); this milestone only builds the
  shape and the computation, not the sync itself.
- `LOCAL_STUDENT_ID` / `computeLocalStudentAnalyticsSnapshot()` — since there's exactly one
  "student" per device today, a fixed placeholder id stands in until real accounts exist. Nothing
  currently calls this convenience wrapper from a screen — it exists as the documented entry point
  a future instructor-facing feature would use.

## Constants (`src/constants/analyticsConfig.ts`)

Every threshold or weight M7.4–M7.6 depends on lives here, named, per "Do not hardcode thresholds
without constants/configuration":

| Constant | Value | Used by |
|---|---|---|
| `MIN_QUESTIONS_FOR_SIGNAL` | 5 | M7.4 domain signal eligibility, M7.6 domain coverage |
| `WEAK_DOMAIN_COUNT` | 3 | M7.4 weak-domain ranking |
| `STRONG_DOMAIN_COUNT` | 3 | M7.4 strong-domain ranking |
| `RISK_DOMAIN_THRESHOLD_PCT` | 65 | M7.4 risk-domain cutoff |
| `RECOMMENDED_SESSION_QUESTION_COUNT` | 20 | M7.5 session size cap |
| `RECENT_MISSES_LOOKBACK_COUNT` | 50 | M7.5 recent-misses candidate pool |
| `READINESS_WEIGHTS` | 0.35 / 0.25 / 0.20 / 0.20 | M7.6 score composition |
| `READINESS_FULL_VOLUME_QUESTION_COUNT` | 500 | M7.6 question-volume component |
| `READINESS_FULL_COVERAGE_DOMAIN_COUNT` | 5 | M7.6 domain-coverage component |
| `READINESS_TREND_DELTA_PCT` | 5 | M7.6 trend direction threshold |

## Testing

All M7 business logic lives in pure functions and is unit tested — the same
pure-function-first / thin-untested-hooks split established in M4–M6 (see those milestones' notes
for the full rationale). New/updated test files:

- `examResultService.test.ts` — M7.1 field extensions, `getReviewPaletteEntries`, `computeExamHistory`.
- `examResultsStorage.test.ts` — fixture updated for the new `ExamResult` fields.
- `progressAnalyticsService.test.ts` — unaffected by the additive `correctCount` field (existing
  assertions use `toMatchObject`, not `toEqual`).
- `weaknessDetectionService.test.ts` (new) — domain combination, signal eligibility, weak/strong/risk ranking.
- `recommendationService.test.ts` (new) — recent-misses correctness (including the "fixed on
  retry" and "wrong again after a fix" cases), domain recommendation tagging/sorting, real
  question-id resolution against the actual content repository.
- `readinessScoreService.test.ts` (new) — each component in isolation, weighted-sum composition,
  trend direction/threshold, zero-data baseline.
- `instructorAnalyticsService.test.ts` (new) — snapshot correctness, JSON round-trip
  (serializability), zero-data baseline.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx jest` — **240/240 tests passing**, 20 suites.
- `npx expo export --platform ios` — succeeds (bundled, 990 modules).
- `npx expo export --platform android` — succeeds (bundled, 990 modules).

No simulator/emulator is available in this sandbox (verified via `xcrun`, `ANDROID_HOME`/`emulator`,
and `/dev/kvm` checks, consistent with every prior milestone) — no screenshots or screen recordings
are included for M7. To verify visually: `npx expo start` from `mobile/`, then open in Expo Go or
a local simulator/emulator; the new screens to check are Exam Results (extended stats/breakdown +
"Review Questions"), the question review flow, Progress (readiness card + the two new link
buttons), Recommended Study, a recommended Study Session, and Exam History.

## Future extension points

- **M7.5 study sessions** could grow session-position persistence (mirroring
  `qbankSessionStorage`) if product feedback says a recommended session should be resumable rather
  than always-fresh — the scope line drawn above is a product decision, not a technical limitation.
- **M7.6 readiness score** — `READINESS_WEIGHTS` is a natural first tuning knob once real usage
  data exists; the four components are independent and could gain more later (e.g. a
  time-management/pacing component once M7.1's timing data has enough history to be meaningful)
  without changing the scoring shape.
- **M7.8** — the obvious next step, once real accounts exist, is a storage/sync layer that
  collects `StudentAnalyticsSnapshot`s per student and an actual instructor-facing screen to read
  them; both are explicitly out of this milestone's scope per the task's own instruction ("do not
  build full instructor accounts yet").
- **Domain naming** — NAPLEX domains are still shown as "Domain 1".."Domain 5" (no proper names
  exist in the source content, per M3/M5's original finding) — if a future content update adds
  real domain names, `src/constants/domains.ts` is the single place to change.
