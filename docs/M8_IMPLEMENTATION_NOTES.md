# M8 Implementation Notes — AI Question Generation Integration

Companion to `docs/MOBILE_MIGRATION_AUDIT.md` (especially §G and §I) and the M1–M7 implementation
notes. Scope: wire the mobile app to the **existing, real** `generate-question.mts` Netlify
function — no local question generation, no exposed API key, questions rendered through the same
Question Engine as QBank and Exams.

## Files created

```
mobile/src/
  api/
    apiConfig.ts                      API_BASE_URL — see "Base URL" below
    aiQuestionService.ts              typed client: prompt building, request, response parsing/validation
    aiQuestionService.test.ts

  constants/
    aiQuestionConfig.ts                REQUEST_TIMEOUT_MS / MAX_TOKENS / CACHE_MAX_ENTRIES, named

  storage/
    aiQuestionCacheStorage.ts          local cache of recently generated questions
    aiQuestionCacheStorage.test.ts

  hooks/
    useAIQuestionGeneration.ts         generation loading/error state + cache write, no auto-retry
    useAIQuestionSession.ts            useCachedAIQuestions (loader) + useAIQuestionEngineSession (engine wiring)

  components/ai/
    SelectChip.tsx                     single-select pill (Domain/Difficulty pickers)
    AIGenerationErrorNotice.tsx        typed-error-kind message + Try Again button

  screens/qbank/
    AIQuestionSetupScreen.tsx          System / Topic / Domain / Difficulty picker + Generate
    AIQuestionSessionScreen.tsx        the generated question(s), via the reusable Question Engine

  navigation/
    QBankStackNavigator.tsx            QBank -> AIQuestionSetup -> AIQuestionSession

  services/
    aiQuestionEngineIntegration.test.ts  proves a generated question works through the unmodified engine
```

## Files modified

- `src/models/question.ts` — added a third `QuestionSource` variant, `{kind: 'ai', generatedAt:
  string}`, alongside the existing `'qbank'`/`'exam'` (additive — the discriminated union grew a
  case, nothing existing changed shape). TypeScript's exhaustiveness checking caught the one place
  that needed a matching update:
  `src/services/progressAnalyticsService.ts`'s `questionLabelFor()` (used by the Progress
  dashboard's Recent Activity list) — added the `'ai'` branch explicitly rather than leaving it
  to fall through to the `'exam'` branch's `examNumber`/`slot` access (which would have been a
  compile error, and a real bug at runtime otherwise).
- `src/screens/home/SystemScreen.tsx` — `navigation.navigate('QBankTab')` →
  `navigation.navigate('QBankTab', { screen: 'QBank' })`, required once `QBankTab` became a nested
  stack (see "Navigation" below). No behavior change — still lands on the same QBank screen.
- `src/screens/qbank/QBankScreen.tsx` — added a "✨ Generate AI Practice Question" button above the
  existing QBank session, navigating into the new setup flow. Per the audit and this file's own
  pre-existing comment: "AI-generated practice doesn't get its own tab... it's an entry point
  reached from within QBank/Home, not a standalone destination" — this is that entry point, now
  actually built rather than just documented as a future plan.
- `src/navigation/types.ts` — added `QBankStackParamList`; `MainTabParamList.QBankTab` changed
  from `undefined` to `NavigatorScreenParams<QBankStackParamList>` (QBank was a flat tab screen
  through M7, same as Progress was before M7's own stack conversion).
- `src/navigation/MainTabNavigator.tsx` — `QBankTab` now points at `QBankStackNavigator` instead
  of the flat `QBankScreen`.
- `src/api/README.md` — updated to describe what was actually built (was a stub since M1
  describing planned M9/M10 clients under the plan's original numbering — this session's M8 is
  that same integration, built now).

**No new dependencies added.** `fetch`/`AbortController` are React Native/Hermes globals; no
HTTP client library was added. No picker/dropdown library was added — the System/Topic/
Domain/Difficulty selection UI is plain `Pressable` rows and pills, consistent with the rest of
the app (no picker component exists anywhere else in this codebase either).

## Architecture: reusing the real backend, not inventing one

`generate-question.mts` (verified by direct inspection, `mobile-source/web-reference/netlify/
functions/generate-question.mts`) is a **generic, token-gated Anthropic proxy** — it accepts
`{messages, max_tokens}`, pins the model server-side (`claude-sonnet-4-6`, regardless of what the
client sends), and forwards the *raw* Anthropic Messages API response back verbatim. It has no
concept of "system," "topic," "domain," or "difficulty," and no dedicated `difficulty` parameter
of any kind — every domain-specific decision (what to ask for, how to parse what comes back)
happens entirely client-side, in `aiQuestionService.ts`.

This mirrors the one real, audited prompt/response contract (audit §I): the client builds a
prompt that embeds `system.label`/`system.quizBrief` (this app's `Lesson` model has no `domain`/
`brief` fields — confirmed absent at M2 — so the audit's alternate "or system.label +
system.quizBrief" branch is the one used), demands raw JSON only, and validates the response into
the exact `{stem, options, correctLabel, rationale}` shape the audit confirmed as the one real,
working contract. **SATA/numeric AI-question generation is out of scope for M8** — inventing an
unvalidated prompt/response shape for those types isn't "reusing the existing backend," it's
guessing at a new one; the audit only documents the single-answer shape as real.

### The four picker dimensions

- **System** (required) — every real system from `contentRepository.getAllSystems()`.
- **Topic** (optional) — a lesson *within* the chosen system (`contentRepository.
  getLessonsForSystem(systemKey)`). Confirmed against the real content: each system maps to
  exactly one broad `topicLabel` at the *question* level, but has multiple real, distinct lesson
  titles (5-6 typically) — so "Topic" is implemented as lesson selection, the one place in the
  content model with genuine sub-system granularity to offer. Selecting a topic adds its
  `title`/`note` to the prompt as extra focus, on top of the system-level `quizBrief`.
- **NAPLEX Domain** (required) — 1-5, embedded in the prompt and stamped directly onto the
  resulting `Question.domain` (so a generated question's domain is exactly what was asked for,
  not inferred).
- **Difficulty** (optional) — "if supported by the backend": the backend has no dedicated
  difficulty parameter at all, so this is satisfied by embedding a `Difficulty: <level>` line in
  the prompt text when selected, with an "Any" (omitted) default — not a fabricated structured
  API field that doesn't exist server-side.

## Auth: the real 401, not a faked one

The backend requires `?token=`/`x-access-token` to gate API costs to paying users (audit §G). This
app has **no purchase/entitlement flow yet** — that's M10 (pricing/access architecture), not yet
built. Rather than fabricate a token or silently skip the auth requirement, `AIQuestionSetupScreen`
passes `accessToken: undefined` today and the request is still made for real. If the deployed
backend is reachable, this **will** get a real 401 back — which surfaces through the normal
failure-handling path as `kind: 'unauthorized'`, with the message "AI practice requires an active
QBank/course access. Please unlock access and try again." This is intentional and documented, not
a bug: once M10 ships a real access-token store, wiring it in is a one-line change to that one
`accessToken:` value — nothing in `aiQuestionService.ts` needs to change.

## Base URL

`src/api/apiConfig.ts`'s `API_BASE_URL` is a **placeholder that does not resolve** — no live
PharmDPrepped Netlify deployment URL has been provided to this project (only the static site
snapshot under `mobile-source/web-reference/`, which has no domain recorded anywhere in it or in
`netlify.toml`). Guessing a domain risked being silently wrong forever; instead this is one named
constant, clearly marked, that must be set to the real origin before this feature can reach the
real backend from a device. Every other piece (prompt building, request shape, response parsing,
caching, UI, error handling) is fully built and tested against that one seam.

## Failure handling

`AIQuestionServiceError.kind` is one of:

| Kind | When | User-facing message |
|---|---|---|
| `network` | `fetch` itself throws (offline, DNS, connection refused) | "No connection to the AI service. Check your network and try again." |
| `timeout` | No response within `aiQuestionConfig.REQUEST_TIMEOUT_MS` (30s), via `AbortController` | "The request took too long. Check your connection and try again." |
| `unauthorized` | 401 from the backend | "AI practice requires an active QBank/course access..." |
| `backend` | Any other non-2xx (the backend's own errors, or an Anthropic-side failure it surfaced) | the backend's own `error` message if present, else a safe generic one |
| `malformed` | 2xx, but the body isn't the expected Anthropic shape, or the model's text isn't valid/complete question JSON | a safe, specific "please try again" message per failure point |

Every message is hand-written and safe to show a student as-is — never a raw exception, stack
trace, or backend/Anthropic internals (the malformed-response tests specifically check this).
`AIGenerationErrorNotice` renders a title (from `kind`) + the message + a "Try Again" button.

**No automatic retry.** A failed generation call is a potentially real, billed AI API request;
silently retrying it in a loop isn't something this client does on its own. "Retries" (the task's
own testing requirement) means: the service is stateless and safely re-callable — calling
`generateQuestion` again with the same params after a failure works correctly, with no lingering
broken state from the previous attempt (`AbortController`s are created fresh per call; nothing is
cached across calls except the deliberate `aiQuestionCacheStorage` writes on success). The "Try
Again" button is exactly that: an explicit user-triggered re-call, never a hidden auto-retry loop.

## Caching

`aiQuestionCacheStorage.ts` — same one-JSON-array-under-one-AsyncStorage-key pattern as
`attemptsStorage`/`examResultsStorage`. Every successfully generated question is appended;
capped at `aiQuestionConfig.CACHE_MAX_ENTRIES` (50), oldest evicted first. "Cache recently
generated questions locally so students can continue reviewing them offline during the same
session" is satisfied by AsyncStorage durability (consistent with every other local-persistence
module in this app) — this is a superset of "same session only," not a violation of it: the cache
also survives an app backgrounding/foregrounding or a cold restart, which only helps offline
continuity, never hurts it. No explicit TTL/expiry was added; a future milestone could add one if
product wants a stricter session boundary.

## Question Engine integration

`AIQuestionSessionScreen` renders the AI-generated question set through the exact same
`useQuestionEngine`/`QuestionEngineView` QBank (`QBankScreen`) and M7.5's recommended study
sessions (`StudySessionScreen`) already use — no separate answer-rendering UI exists for AI
questions anywhere in this codebase.

One real engine constraint shaped the hook design: `useQuestionEngine`'s `useReducer` only reads
its `questions` argument on the **first** render (`useReducer`'s documented init-function
behavior) — feeding it a still-loading (`[]`) array and later swapping in the real, loaded array
does **not** update the engine's live `state.questions`. `useAIQuestionSession.ts` is split into
two hooks specifically to avoid this: `useCachedAIQuestions()` (just the async load) and
`useAIQuestionEngineSession(questions)` (the actual `useQuestionEngine` wiring), with
`AIQuestionSessionScreen` only mounting the component that calls the second hook once the first
hook's `isLoading` has cleared — so the engine's very first render already has the real data.

**No mid-session question appension**, same documented tradeoff as M7.5's study sessions: cached
questions are ordered **newest-first** and captured once per screen mount. Generating another
question navigates back to the setup screen, then **pushes** (not `navigate`s) a fresh
`AIQuestionSession` screen instance — guaranteeing a new mount that picks up the current full
cache, including the just-generated question at index 0, without needing any question-engine
appension machinery. `navigation.push` (rather than `navigate`) is what makes this reliable: it
always creates a new screen instance, rather than updating params on a possibly-already-mounted
one.

Submitted answers on AI-generated questions **are** recorded to `attemptsStorage`, exactly like
QBank — this is real practice activity, not a second-class untracked mode. One known, accepted
limitation: AI questions are never added to `contentRepository` (they're ephemeral, cache-only —
see `QuestionSource`'s `'ai'` variant doc comment), so if an AI-answered question is later
referenced by an M7.5 recommendation (e.g. as a "recent miss") after it's aged out of the cache,
`contentRepository.getQuestionById` returns `undefined` and the recommendation consumer's existing
`.filter((q) => q !== undefined)` step silently drops it — a graceful, pre-existing degradation
path, not a crash.

## Testing

- `aiQuestionService.test.ts` — `buildGenerateQuestionPrompt` (system/domain/quizBrief always
  present; topic/difficulty only when provided), `parseGenerateQuestionResponse` (valid response,
  fenced markdown stripped, every malformed-shape case: no `content` array, non-JSON text, missing
  fields, `correctLabel` not among the options, fewer than 2 options, empty text), and
  `generateQuestion` against a mocked `fetch` (success including exact request shape sent, header
  presence/absence for the access token, `network`/`timeout`/`unauthorized`/`backend`/`malformed`
  for every error path, and two explicit retry scenarios proving the service is safely re-callable
  after a failure with no shared broken state).
- `aiQuestionCacheStorage.test.ts` — append-not-overwrite, `getById`, oldest-first eviction at the
  cap, AsyncStorage round-trip, `clearAll`.
- `aiQuestionEngineIntegration.test.ts` — a parsed AI-generated question run through the real,
  unmodified `questionEngineReducer`: recognized as the current question, correct/incorrect
  scoring via the same `scoringService` QBank/exams use, the "can't submit nothing" rule, and the
  "locked after submit" immutability rule — proving there is no separate scoring/state path for
  AI questions.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx jest` — **271/271 tests passing**, 23 suites (5 new test files, 32 new tests).
- `npx expo export --platform ios` — succeeds.
- `npx expo export --platform android` — succeeds.

No simulator/emulator is available in this sandbox (re-verified, consistent with every prior
milestone) — no screenshots/recordings are included. To verify visually: `npx expo start` from
`mobile/`, open the QBank tab, tap "✨ Generate AI Practice Question," and either point
`API_BASE_URL` at a real deployed backend or observe the (real, typed) `network`/`unauthorized`
failure path against the placeholder origin.

## Future extension points

- **Base URL** — set `API_BASE_URL` once a real PharmDPrepped Netlify deployment exists.
- **M10 (access tokens)** — once built, `AIQuestionSetupScreen`'s `accessToken: undefined` becomes
  a real read from that store; no other file needs to change.
- **SATA/numeric AI generation** — would need its own validated prompt/response contract (not yet
  audited as real anywhere); `parseGenerateQuestionResponse`'s validation function is the one
  place that would grow a second shape.
- **Cache TTL** — if product wants "same session" enforced strictly rather than the current
  durable-cache superset, add an expiry check to `aiQuestionCacheStorage.getAll()`.
