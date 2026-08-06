# M5 Implementation Notes — Progress & Analytics

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`, and the M1–M4
implementation notes. Scope: a real Progress dashboard (overall stats, per-system performance,
per-domain performance, recent activity), built entirely on M4's `attemptsStorage` — no new data
source, no cloud sync, no authentication.

## Files created

```
mobile/src/
  services/
    progressAnalyticsService.ts       pure aggregation: overall/system/domain stats, streak, recent activity
    progressAnalyticsService.test.ts
  hooks/
    useProgressDashboard.ts           loads attempts once, memoizes every derived stat
  utils/
    formatDate.ts                     "Today at 2:30 PM" / "Yesterday" / "Jan 10" / "Never"
    formatDate.test.ts
  components/progress/
    StatTile.tsx                      one dashboard stat (Total Answered, Accuracy, Today, ...)
    SystemPerformanceRow.tsx          tappable — questions answered, accuracy, coverage bar, last attempted
    DomainPerformanceRow.tsx          accuracy-based bar per NAPLEX domain 1-5
    RecentActivityRow.tsx             question label, system, correct/incorrect, timestamp
```

Modified:
- `src/screens/progress/ProgressScreen.tsx` — real dashboard (was the M1 stub).
- `src/services/contentRepository.ts` — **bug fix, not new scope**: `getQuestionById()` only ever
  indexed QBank questions, never exam ones, despite the `Question` model having supported both
  sources since M2. Found while building `getRecentActivity()`'s question-label resolution (a
  synthetic test using an exam-sourced ID failed against the real content). Now resolves both —
  see `contentRepository.test.ts`'s new test.
- `src/services/contentRepository.test.ts` — locks in the fix above.

**No new dependencies added.**

## Dashboard architecture

Same three-layer pattern established in M4 (pure aggregation → thin hook → dumb components),
applied to analytics instead of question state:

```
services/progressAnalyticsService.ts   pure functions over an already-loaded Attempt[]:
                                        computeOverallStats, computeSystemStats,
                                        computeDomainStats, computeCurrentStreak,
                                        getRecentActivity — no storage, no React
        ↓
hooks/useProgressDashboard.ts          loads attemptsStorage.getAllAttempts() once (+ on focus),
                                        memoizes every derived stat keyed on that array
        ↓
screens/progress/ProgressScreen.tsx    composes the hook + 4 presentational component types
```

Every aggregation function takes `Attempt[]` (and `systems`/`now` where relevant) as plain
arguments rather than reaching into storage itself — this is what makes them directly unit
testable (no AsyncStorage mocking needed in `progressAnalyticsService.test.ts` at all) and what
lets the hook control exactly when re-aggregation happens.

## Statistics calculations

- **Total questions answered** — unique questions with ≥1 attempt, all-time (not raw attempt
  count — re-answering a question doesn't inflate this).
- **Overall accuracy** — computed over each question's **most recent** attempt only, same
  "current mastery, not lifetime average" rule M4 established for per-system accuracy. Getting a
  question wrong once and right on a later retry should read as mastered, not permanently
  penalized.
- **Answered today / this week** — these two are deliberately **attempt counts, not unique
  question counts** (the opposite of "total answered" above) — they're meant to reflect study
  *activity/volume* for a time window, where re-answering a question you're drilling counts as
  real work done that day, not something to be collapsed away. "This week" is a **rolling 7-day
  window ending today** (today + 6 prior days), not a Mon–Sun/Sun–Sat calendar week — simpler,
  avoids a first-partial-week edge case, and matches how "streak" already thinks about days.
- **Study streak** — consecutive local calendar days with ≥1 attempt, counted backwards from
  today. Today is allowed to have zero attempts yet without breaking a streak that was active as
  of yesterday (the day isn't over) — but that grace applies to *today only*; a genuine gap on
  any earlier day stops the count. All local-calendar-day math (not UTC) — see the doc comment on
  `dateKeyOf()` for why `Date`'s local getters are safe to use even after round-tripping through
  arithmetic.
- **Last study session** — the single most recent attempt's timestamp, formatted via
  `formatRelativeDate()`.
- **Per-system stats** — `questionsAnswered`/`accuracyPct`/`lastAttemptedAt` scoped to that
  system's attempts only (verified not to leak across systems); `questionsTotal` from
  `contentRepository`, so a system with zero attempts still shows a real denominator, not a
  placeholder. The progress bar shown is **coverage** (`questionsAnswered / questionsTotal`), a
  deliberately different metric from accuracy (its own separate number) — "how much have I
  attempted" vs. "how well am I doing," both real and both worth showing distinctly.
- **Per-domain stats** — same shape as per-system, but bucketed by `Attempt.domain` (1–5)
  instead of `systemKey`; all 5 domains always render, even at zero attempts, so the dashboard's
  domain section has a stable shape from day one.
- **Recent activity** — the last 20 attempts, most-recent-first, each resolved to a real
  human-readable question label (`"QBank Q42"` / `"Exam 1 Q10"`, derived from the actual
  `Question.source.index`/`slot` via `contentRepository.getQuestionById()`, never a fabricated
  identifier) and real system label.

## Performance considerations

- **Attempts load once per focus, not once per render.** `useProgressDashboard`'s
  `attemptsStorage.getAllAttempts()` call is behind `useEffect`/`useFocusEffect`, not inline in
  the render body.
- **Every derived stat is `useMemo`'d, keyed on the attempts array reference** (plus `systems`/
  `now` where relevant) — `computeOverallStats`/`computeSystemStats`/`computeDomainStats`/
  `getRecentActivity` only re-run when attempts actually changed (a fresh load), not on unrelated
  re-renders of `ProgressScreen`.
- **`now` is captured once per data load**, not recomputed every render — a Progress dashboard
  doesn't need a live-ticking clock; freshness is bounded by "how recently did this screen
  regain focus," which is enough for day-granularity stats like streak/today/this week.
- **`SystemPerformanceRow` and `RecentActivityRow` are `React.memo`'d** — with 27 system rows and
  up to 20 recent-activity rows rendered per screen, this avoids reconciling all of them when an
  unrelated part of the dashboard re-renders.
- **No repeated content parsing** — `progressAnalyticsService` reads `contentRepository`'s
  already-built indices (`getQuestions({systemKey})`, `getQuestionById()`, `getSystem()`), never
  `JSON.parse`s a content file itself.

## Tests added

131 tests total across the app (up from 101 after M4); everything the task asked to expand,
plus the resulting `contentRepository` fix:

| Area | File | What's covered |
|---|---|---|
| Progress calculations | `progressAnalyticsService.test.ts` | total-answered counts unique questions not raw attempts, overall accuracy scored on latest attempt only, today/this-week attempt-count windows including the exact 7-day boundary, last-session timestamp regardless of array order |
| Streak calculations | `progressAnalyticsService.test.ts` (`computeCurrentStreak`) | zero attempts, single day, consecutive days, a gap breaking the streak, "no activity yet today" not breaking an active streak, a gap on yesterday zeroing the streak despite older activity, same-day multiple attempts counting once |
| Domain statistics | `progressAnalyticsService.test.ts` (`computeDomainStats`) | all 5 domains always present even at zero attempts, correct per-domain aggregation independent of system |
| System statistics | `progressAnalyticsService.test.ts` (`computeSystemStats`) | zero-attempt system still has real `questionsTotal`, attempts scoped correctly (no cross-system leakage), `lastAttemptedAt` reflects the true most-recent attempt |
| Recent activity ordering | `progressAnalyticsService.test.ts` (`getRecentActivity`) | most-recent-first ordering, limit respected, real question-label resolution for both QBank and exam sources, real system-label resolution, `isCorrect` carried through untouched |
| Date formatting | `formatDate.test.ts` | null → "Never", today/yesterday/older-date branches, 12-hour boundary (noon/midnight) |
| (fix) `getQuestionById` | `contentRepository.test.ts` | now resolves exam questions too, not just QBank ones |

## Known limitations

- **No simulator in this environment** — same constraint as M1–M4, documented in
  `docs/demo/README.md`. Nothing fabricated; see "Build/launch verification" below.
- **"This week" is a rolling 7-day window, not a calendar week.** A reasonable, documented
  product decision (see above), but worth confirming it matches expectations before this becomes
  a load-bearing metric for anything else.
- **Streak has no "freeze"/grace-day concept** (some habit apps allow one missed day without
  breaking a streak) — a plain consecutive-days count, matching "basic local implementation" from
  the task.
- **27 system rows and up to 20 recent-activity rows all render via `.map()` inside a
  `ScrollView`, not a virtualized list** — fine at this scale (matches the same choice made for
  the 19-card "More Topics" grid in M3), would need revisiting if either list's size grows by an
  order of magnitude.
- **No pull-to-refresh** — the dashboard already refreshes on screen focus, but there's no manual
  refresh affordance for a user who wants to force a re-read without navigating away and back.
- **The dashboard has not been visually verified** — same reasoning as prior milestones; the
  math is thoroughly unit-tested, but nobody has looked at the 6-tile stat grid, the 27-row
  system list, or the recent-activity feed actually rendered.

## Build/launch verification (no simulator available — nothing fabricated)

Same environment constraint as M1–M4 (full explanation in `docs/demo/README.md`): no macOS/
Xcode, no Android SDK/emulator, no `/dev/kvm`, no device, no display.

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run lint` (`eslint .`) — clean.
- `npm test` — **131/131 passing.**
- `npx expo export --platform ios` and `--platform android` — both succeed (~4.9MB Hermes
  bytecode bundles each, zero bundler errors).

**The project builds successfully.** What hasn't been confirmed is what the dashboard actually
looks like rendered — stat-tile grid wrapping, the 27-row system list's scroll behavior, whether
the domain accuracy bars read clearly at a glance. Recommend a real device/simulator pass before
relying on this milestone's UI being production-ready as-is, same recommendation as M4.

## Recommendations for M6

1. **This is the natural point to build the real offline-storage layer M6 was always meant to
   be** — `attemptsStorage` and `onboardingStorage` (M3) already exist as real, working pieces;
   M6's job is formalizing them into one versioned, migratable storage layer (schema version +
   migration runner) rather than leaving each concern as its own ad hoc module forever, per the
   boundary notes left in both M3 and M4's docs.
2. **Lesson-completion tracking** is the one piece of "progress" still entirely unbuilt —
   `SystemProgress.lessonsCompleted` has been `0` since M3 and nothing in M5 changed that,
   because it's a genuinely separate concern from question attempts and still blocked on the
   lesson-reader content gap (M2/M3). Worth an explicit decision on whether M6 addresses it or it
   stays deferred further.
3. **Consider a lightweight migration test now**, even a trivial one, before real user data
   accumulates in `attemptsStorage`'s current schema — M6 changing the `Attempt` shape later
   without a migration path would strand existing local data.
4. **Pull-to-refresh on the Progress screen** is a small, cheap addition worth picking up
   whenever the UI polish pass (M11, or sooner) happens.
