# PharmDPrepped → React Native Mobile Migration: Audit

**Status:** Phase 1/2 deliverable. Inspection only — no mobile app code has been written yet.
**Inputs inspected:** `pharmdprepped_content_export.zip` (real content, see `mobile-source/content-export/`)
and `pharmdpreppednetlifydeploy.zip` (the deployed web app, see `mobile-source/web-reference/`).
**Not inspected:** `PharmDPreppedMobileScaffold.zip` — it was never provided. See §A.

---

## Before anything else: this is not the app the brief describes

The task brief describes a "fully built" PharmDPrepped product with live Stripe purchases and
gated content. What was actually provided and inspected is a **pre-launch marketing site with
working interactive previews**, not a transacting product. This changes what "source of truth
for behavior" means in several places, documented inline below. Headline findings:

1. **No paywall exists in the frontend today.** Every pricing plan button (`Course Access`,
   `QBank Access`, `Course + QBank`) links to `#join` — an email waitlist form — not to Stripe
   Checkout. `create-checkout.mts` is never called from `index.html`. The body map, all 26
   systems, the full 2,000-question bank, and all three 225-question exams render fully
   unlocked to anyone on the page.
2. **The pricing formula is real but currently cosmetic.** `Price(days) = base × days^0.425` is
   implemented client-side and drives the on-page calculator, but `create-checkout.mts` only
   ever creates a Stripe session for one fixed `STRIPE_PRICE_ID` — it has no concept of plan
   (course/qbank/bundle) or day-count. The formula is not yet wired to what a user would
   actually be charged.
3. **The four client-side "Generate a question / flashcards" demo buttons call
   `https://api.anthropic.com/v1/messages` directly from the browser with no API key at all.**
   These are dead in production (they'll 401) — they predate `generate-question.mts`, which
   *is* the correct, secured, token-gated proxy. Do not port the direct-call pattern to mobile;
   only `generate-question.mts`'s contract is real.
4. **All exam and progress persistence today is client-side `localStorage`**, via a shim the
   code calls `window.storage` (a leftover from prototyping this page as a Claude.ai artifact,
   later shimmed to real `localStorage` for production). `progress.mts` (Netlify Blobs, keyed by
   access token) exists in the backend but nothing in `index.html` calls it. There is currently
   no cross-device sync.
5. **The 2,000-question standalone QBank practice mode does not appear to be wired into the UI
   yet** — `QBANK_QUESTIONS` loads via `qbank-data.js` but the only consumer of question data
   found in `index.html` is the fixed-exam engine (`EXAM_QUESTION_BANK`). The 2,000-question
   bank is real, complete, and correctly shaped, it's just not yet rendered as its own practice
   mode on the web. This is the one area where mobile will be building a genuinely new feature
   rather than porting an existing one, though the exam engine's UI/scoring patterns are a
   direct template for it.

None of this blocks the mobile migration — if anything it simplifies it, because content
delivery (body map, lessons, QBank, exams) is real and complete, while payments are the one area
genuinely still under construction on the web side too. Phase 11's instruction to research
App/Play Store payment requirements before building mobile payments is *more* right than the
brief assumed, not less: there is no working end-to-end web purchase flow to copy from yet.

---

## A. Existing web architecture

- No framework, no bundler, no `node_modules`. `mobile-source/web-reference/index.html` (3,683
  lines) is the entire marketing site + interactive app surface: inline `<style>`, inline
  `<script>`, base64-embedded logo images, all in one file. `qbank-data.js` (3.1 MB) is loaded
  `defer` separately so the ~3.2 MB of question data doesn't block first paint.
- `success.html` is the Stripe return page: reads `session_id` from the query string, calls
  `GET /api/verify-session`, stores the returned access token in `localStorage`
  (`pharmd_access_token`), redirects back to `/index.html?entering=1`.
- `netlify.toml`: `publish = "."`, functions directory `netlify/functions`. `package.json` has
  no dependencies and a stub `test` script — there is no build step to replicate.
- **No mobile scaffold was provided.** The brief's Phase 1/3 assumed
  `PharmDPreppedMobileScaffold.zip` would supply an existing Expo/RN project structure to extend.
  The file actually uploaded in its place (`pharmdpreppednetlifydeploy.zip`) is a second copy of
  the web deploy, not a mobile project. **M1 will need to `npx create-expo-app` from scratch**
  rather than extend an existing scaffold. If a real mobile scaffold exists somewhere, send it
  before M1 starts — otherwise this audit proceeds on the assumption that M1 is a clean init.

## B. Existing data architecture

Three flat JSON files, no database, no ORM:

- `qbank_questions.json` — array of 2,000 objects, no `id` field (position is the effective
  identity; the content layer must synthesize a stable ID during import, see §L).
- `exam_question_bank.json` — `{ "1": {"0": {...}, "1": {...}, ...}, "2": {...}, "3": {...} }`,
  225 slots per exam keyed by **string** slot index, not an array.
- `systems.json` — `{ [systemKey]: {label, description, lessons[], available, chip?, x?, y?,
  quizBrief} }`, keyed by a short internal system key (`cardio`, `neuro`, ... — see §C).

No versioning, no migrations, no schema validation today (plain `JSON.parse`).

## C. Existing content structure

**Systems (26 total, `systems.json`):**

| Body-map systems (have `x`/`y`, 8 total) | Chip / list-only systems (18 total) |
|---|---|
| cardio, neuro, respiratory, gi, endocrine, renal, uro, rheum | immuno, peds, geri, derm, ophtho, calc, heme, repro, id, compounding, medsafety, druginfo, pharmops, otc, ethics, biostats, tox, nutrition |

Coordinates are in a **300×640 viewBox** (confirmed against the SVG in `index.html`, which
renders `<circle class="pulse" cx="${s.x}" cy="${s.y}" r="8">` directly against that viewBox) —
matches the content export README's claim exactly. `body_map_diagram.png` is 808×1964px;
coordinates must be scaled by the same x/y factors the rendered image uses, not assumed square.

Only 8 of the 26 `chip: true`/`false` flags map to "should this render on the anatomical body" —
this is exactly the split Phase 5 of the brief calls "body-map systems" vs. "More Topics," and
the flag already encodes it correctly. `available` is `true` for all 26 in the current export
(the `!available` → "Coming soon" branch in `index.html` is currently dead code for every
system) — content is complete for all 26 topics today, not partially built.

**Lessons (101 total):** each system's `lessons[]` is `{title, note}` only — a one-line
description, not full lesson body copy. There is no full-text lesson reader content in this
export. `quizBrief` (a dense paragraph per system) is the closest thing to a "lesson body," but
it's written as an AI-prompt content summary, not learner-facing prose — using it verbatim as a
lesson screen would read like a cram sheet, not a lesson. **Flag for the user**: if a true
lesson-reader (Phase 6: Lessons step in the core flow) is wanted for M4, either full lesson body
text needs to be exported separately, or M4's "lesson reader" needs to be scoped down to a
lesson *list* (title + note, linking straight into topic-tagged practice questions) until that
content exists. Do not invent lesson body prose to fill the gap — that would violate "do not
create fake content."

**Topic-label mapping is not 1:1 with system keys — build this table explicitly, don't
string-match:**

| `topicLabel` in question JSON | → system key | note |
|---|---|---|
| `Infectious Disease` | `id` | `systems.json`'s `id.label` is `"Infectious Disease & Immunology"` — **does not literally match** the qbank's `topicLabel`. String-matching label-to-label will silently drop all 55 "Infectious Disease" questions from that system. |
| `Drug Class Study Guide` (99 questions) | *(none)* | Not a system at all — corresponds to the web's separate `DRUG_CLASSES` quick-reference table feature. Needs its own non-anatomical content section, not a system tile. |
| all other 25 `topicLabel`s | exact string match to the corresponding `systems.json[key].label` | verified programmatically, no other mismatches |

**Question types (2,000 in QBank, 675 across 3 exams):**

| type | QBank count | Exam count (all 3) | Shape |
|---|---|---|---|
| `single` | 1,883 | 631 | `options: [{label, text}]×4`, `correctLabel`, `rationale` |
| `numeric` | 115 | 42 | `correctValue`, `tolerance`, `unit`, `rationale` |
| `sata` | 2 | 2 | `options`, `correctLabels: string[]`, `rationale` — **only exists in Exam 1**, both copies |

Domain split confirmed exactly: **500/500/800/100/100 = 25%/25%/40%/5%/5%**, matching the brief's
stated NAPLEX blueprint precisely, both in the 2,000-question bank and (proportionally, 56/56/91/
11/11 per 225-question exam) across all three exams. This distribution must not be altered.

## D. Existing question types (engine behavior, from `index.html`'s exam runner)

- `single`: click one option → immediately marked selected, saved, "Next" enabled.
- `sata`: toggle multiple option buttons; `answers[index]` is an array of chosen labels;
  "Next" enables as soon as ≥1 is chosen.
- `numeric`: free-text input (`inputmode="decimal"`), saved on every keystroke.
- Every answer write immediately persists via `saveFixedExamProgress` (debounced only by the
  browser's own event loop) — there is no "save on exit" step; state is durable per-question.

## E. Existing scoring logic (`gradeAnswer()`, `index.html:3535`)

```js
function gradeAnswer(q, userAns){
  if (userAns == null || userAns === '') return false;
  if (q.type === 'sata') {
    // all-or-nothing: user's chosen set must exactly equal q.correctLabels (order-independent)
    const correctSet = q.correctLabels.slice().sort();
    const userSet = userAns.slice().sort();
    return correctSet.length === userSet.length && correctSet.every((v,i) => v === userSet[i]);
  }
  if (q.type === 'numeric') {
    const val = parseFloat(userAns);
    if (isNaN(val)) return false;
    return Math.abs(val - q.correctValue) <= q.tolerance;   // inclusive tolerance band
  }
  return userAns === q.correctLabel;
}
```

Exam scoring: `score% = round(correctCount / answeredCount × 100)` — **the denominator is
answered questions, not total 225** (an exam submitted with unanswered questions is graded on
what was answered, not penalized to 0 for blanks). Domain breakdown is a parallel
`{1:{a,h}, ..., 5:{a,h}}` accumulator (attempted/hits) built in the same pass. This exact
semantics (tolerance-inclusive numeric grading, exact-set SATA grading, answered-not-total
denominator) must be preserved in the mobile scoring service — it's a business rule, not an
implementation detail, and Phase 13 says not to change business rules without documenting why.

## F. Existing body-map implementation

- SVG-based, single `<svg class="body" viewBox="0 0 300 640">` containing a `<image>` of
  `body_map_diagram.png` plus one `<g class="hotspot">` per body-map system, positioned with
  `cx="${s.x}" cy="${s.y}"` circles (a pulsing "available" ring + a solid dot), `onclick` selects
  that system and scrolls the "Behind the Counter" panel into view.
- `.hotspot.selected` / `.hotspot.available` are CSS state classes driving color (uses the
  brand's amber/flag/teal-deep palette — see §J).
- Non-anatomical systems render as a separate scrollable chip grid (`buildCounterGrid()`), fully
  consistent with Phase 5's requirement for a "More Topics" section.

## G. Existing API / Netlify functions (all 5, verbatim contracts)

| Function | Path | Method | Auth | Behavior |
|---|---|---|---|---|
| `generate-question.mts` | `/api/generate-question` | POST | `?token=` or `x-access-token` header, checked against Blobs store `access-tokens` | Forwards `{messages, max_tokens}` to Anthropic; **model is pinned server-side** (`claude-sonnet-4-6`) regardless of client input — client cannot override it. Requires `ANTHROPIC_API_KEY` env var. |
| `create-checkout.mts` | `/api/create-checkout` | POST | none | Creates a Stripe Checkout Session for **one fixed** `STRIPE_PRICE_ID`/quantity 1. No plan or day-count parameters accepted today — see the top-of-document callout. |
| `verify-session.mts` | `/api/verify-session` | GET `?session_id=` | none (the session_id itself is the secret) | Confirms payment via Stripe, then mints (or reuses) a UUID access token stored in Blobs (`token:<uuid>` → `{email, sessionId, createdAt}`, `session:<id>` → `{token, email}`), returns `{valid, token}`. |
| `check-access.mts` | `/api/check-access` | GET `?token=` | — | Returns `{valid: boolean}` by looking up `token:<token>` in Blobs. No expiry field returned to the client despite Phase 11's 3–365-day access-window model — **the current token has no encoded expiry**; day-count-based expiry is not yet implemented server-side. |
| `progress.mts` | `/api/progress` | GET/POST | same token check as above | Generic per-token key/value store on Netlify Blobs (`user-progress` for private, `shared-data` for cross-user, e.g. cached AI exam-question fallbacks). GET supports both single-key fetch and prefix listing. **Not currently called by `index.html`** (see callout above) — real today only as a contract, not as live behavior. |

## H. Existing pricing/access architecture

- Formula (`index.html:1759-1766`, client-side only): `calcPrice(days, base) = base *
  Math.pow(days, 0.425)`, `PRICE_BASES = {course: 39, qbank: 25, bundle: 52}`,
  `PRICE_MIN_DAYS/MAX_DAYS = 3/365`. Confirmed the bundle is always cheaper than
  `calcPrice(days, course) + calcPrice(days, qbank)` at the same day count (the UI computes and
  displays that exact savings figure) — matches Phase 11's bundle-discount requirement.
  Confirmed `includesExams = includesQbank` — exams ship bundled with QBank access, not with
  Course access, per the on-page FAQ.
- **No client code calls `create-checkout`** — every plan CTA is `href="#join"` into the
  waitlist form. There is currently no functioning purchase path to reuse end-to-end; only the
  formula and the backend token/verification primitives are real and reusable.
- Access-token model (mint on paid Stripe session → store in Blobs → client persists in
  `localStorage['pharmd_access_token']` → sent as `x-access-token` on gated calls) is sound and
  reusable as-is for mobile, **but it currently has no day-count/expiry semantics** — that must
  be added server-side (token record needs an `expiresAt`, `plan`, and `days` field) before it
  can back Phase 11's variable-duration access windows on any platform, web or mobile.

## I. Existing AI question-generation flow

Two divergent implementations coexist today, only one of which is correct:

1. **`generate-question.mts` (correct, reusable):** token-gated, forwards `{messages,
   max_tokens}`, model pinned server-side, key never leaves the server. **This is the contract
   the mobile client must call.**
2. **Four inline `fetch("https://api.anthropic.com/v1/messages", ...)` calls in `index.html`**
   (free demo question, per-system flashcards, per-system "generate another question," and the
   exam engine's fallback for any exam slot not in `EXAM_QUESTION_BANK`): no API key attached at
   all, will 401 in production. Dead/broken code, **not a pattern to replicate**. The exam
   engine's fallback path is moot in practice anyway, since all 675 exam slots (225 × 3) are
   already fully populated with hand-authored questions — mobile can treat the 3 exams as 100%
   static content and never needs an AI fallback for them.

Prompt shapes worth preserving for the mobile AI-practice client (Phase 10): the generate-
question prompt embeds `lesson.domain` + `lesson.brief` (or `system.label` + `system.quizBrief`)
and demands **raw JSON only, no markdown fences**, in an exact `{stem, options, correctLabel,
rationale}` shape for single-answer, or a flashcard array shape `[{front, back}]` for flashcards.
The client already has to defensively strip ```json fences before `JSON.parse` — mobile's parser
should do the same.

## J. Existing assets

- `logo_mark.png` (372×414, transparent) — icon-only "P" mark, use for app icon / small nav.
- `logo_full_lockup.png` (1012×661, transparent) — full wordmark + "PREPARE · PRACTICE · PASS"
  tagline, use for splash/onboarding.
- `body_map_diagram.png` (808×1964, transparent) — real traced anatomical illustration, not a
  placeholder. Use directly; do not substitute the scaffold's placeholder body art (none was
  provided anyway — see §A).
- Brand palette, confirmed against `index.html`'s `:root` CSS variables (matches the brief
  exactly): `--ink:#12213B`, `--teal:#0F7D80`, `--teal-deep:#0B5C5E`, `--amber:#DD9A32`,
  `--paper:#F2F4F3`, plus one not mentioned in the brief: `--flag:#AE3B45` (used for
  low-accuracy/incorrect states and the "selected" hotspot ring — worth carrying into mobile's
  theme as a semantic "danger/incorrect" color rather than inventing a new red).
- Fonts: Space Grotesk (display/headings), Source Serif 4 (body), IBM Plex Mono (numeric/mono
  UI chrome like timers and pill labels) — loaded from Google Fonts on web; mobile should bundle
  these via `expo-font` rather than a runtime web-font fetch.

## K. What can be reused

- All three content JSON files, as-is, with a typed loader wrapped around them (§L/M2).
- The exact scoring semantics in §E (tolerance-inclusive numeric, exact-set SATA, answered-not-
  total percentage) — port the logic, not the DOM code.
- The exam blueprint approach: a seeded-random, domain-weighted slot assignment
  (`buildExamBlueprint`) is unnecessary for mobile since all 675 exam questions are static and
  pre-assigned in `exam_question_bank.json` — mobile can just read the fixed shape directly and
  skip blueprint generation entirely (see §L, this is a simplification, not a loss).
  `DOMAIN_TOPIC_POOLS`/`getSlotTopicKey`/`generateFixedExamQuestion` (the AI-fallback machinery)
  can be dropped entirely per §I.
- The body-map hotspot coordinate system and 300×640 viewBox scaling approach.
- `generate-question.mts`, `verify-session.mts`, `check-access.mts` contracts as-is.
- The pricing formula and bundle-discount math.
- Brand tokens (§J).

## L. What must be rewritten for React Native

- The entire UI layer — obviously; there is no component structure to port, `index.html` is a
  single hand-written file with template-literal HTML strings.
- **Question identity.** Neither `qbank_questions.json` nor `exam_question_bank.json` entries
  carry a stable `id`. The content-import step (M2) must synthesize one (e.g.
  `qbank-{index}` / `exam-{examNum}-{slot}`) and treat it as immutable once assigned, since
  local progress/attempt history will be keyed by it.
- The `window.storage` shim (`localStorage`-backed) → replaced entirely by the AsyncStorage-based
  service layer described in Phase 9.
- Exam state machine → currently plain mutable module-level `let fixedExamState` object mutated
  in place; needs a real state machine (reducer or XState) per Phase 8, since RN has no page-
  reload/DOM-persistence safety net the web version incidentally leans on.
- `create-checkout.mts` needs new parameters (`plan`, `days`) before *any* platform (web or
  mobile) can charge the pricing-calculator's displayed amount — currently it can't. This is a
  web-side gap the mobile work will surface, not cause; flag it back to the product owner (see
  Risks, §O).
- Access tokens need an `expiresAt`/`plan`/`days` field added server-side (§H) before mobile (or
  web) can enforce the 3–365 day access windows Phase 11 describes.

## M. What should remain server-side

- The Anthropic API key and the `generate-question` proxy — never bundle a key into the mobile
  app (Phase 10 is explicit about this, and matches how the *correct* function is already built).
- Stripe secret key, checkout session creation, payment verification.
- The access-token ↔ entitlement mapping (source of truth for "does this user have access,"
  even if the token itself is cached on-device for offline checks).

## N. What should be stored locally (device)

Per Phase 9 and consistent with what's already client-persisted today (just moved from
`localStorage` to AsyncStorage/SQLite): onboarding name, QBank attempt history (per-question:
chosen answer, correctness, timestamp), lesson-completion flags, exam progress
(`index/answers[]/startTime/completed/score` — same shape as today's `progress` object, it's a
solid schema), exam results/domain breakdowns, cached access token, cached AI-generated
questions (optional, mirrors today's `shared-data` cache intent).

## O. Potential technical risks

1. **No mobile scaffold exists** — M1 starts from a bare `create-expo-app`, not an extension of
   prior architectural decisions. Ask the user to confirm before M1 if a real scaffold exists
   elsewhere; proceeding without one is the working assumption otherwise.
2. **Pricing/checkout is unfinished even on web.** Mobile payments (Phase 11) cannot be
   "finished" independent of this — at minimum `create-checkout.mts` needs plan/day parameters
   and access tokens need expiry semantics before *either* platform has a real purchase flow.
   Recommend scoping mobile M10 to the payment *architecture* (service abstraction + App/Play
   Store research, exactly as Phase 11 asks) rather than a working purchase button, until the
   backend gap is closed — likely by the web team, not by this mobile effort.
3. **Digital-goods IAP requirement.** Both Apple and Google require in-app digital purchases to
   go through their own IAP/Billing systems (App Store's "reader app" narrow exceptions do not
   cover an exam-prep course); a Stripe Checkout WebView for this content would likely violate
   App Store Review Guideline 3.1.1 / Play's Payments policy. This needs its own research
   spike before M10 (Phase 11 already anticipates this — treat it as confirmed, not hypothetical).
4. **Lesson body content gap** (§C) — Phase 6's "Lessons" step in the core flow has no full-text
   lesson prose to source from yet. Needs a product decision, not an engineering workaround.
5. **1,883 single-answer + 115 numeric + 2 SATA is a heavily skewed type mix** — the SATA
   scoring/UI path will only ever be exercised by 2 of 2,000 QBank questions and 2 of 675 exam
   questions in production data. Must still be fully implemented and tested (Phase 13 is
   explicit: "the question engine must support it") but low real-world coverage means it's
   easy for a regression here to go unnoticed without a dedicated unit test (Phase 14 already
   requires one).
6. **3.1 MB `qbank-data.js` / ~3.5 MB combined JSON.** Fine to bundle in the app (no network
   dependency, satisfies Phase 7's offline requirement) but should be imported as static assets
   processed at build time into a typed/normalized shape (§Q), not `require()`'d as raw JSON
   into a component tree, to avoid bridge-serialization jank on startup.
7. **Topic-label-to-system mismatch** (§C, the `id`/`Infectious Disease` case, and the
   `Drug Class Study Guide` orphan topic) — must be handled by an explicit mapping table in the
   content repository, not inferred by string comparison, or content silently goes missing.

## P. App Store / Google Play considerations

- **Digital course/QBank access is a digital good** → must transact via Apple In-App Purchase /
  Google Play Billing, not an embedded Stripe checkout, on both platforms, for anything unlocked
  inside the app. (Web can keep Stripe; that's a separate, already-compliant channel.)
  Cross-platform entitlement (a QBank purchased on web should also unlock on mobile) is legally
  fine as *account-based entitlement* recognition — what's not fine is *initiating* the purchase
  itself outside each store's IAP inside the app.
  Reader-app exception does not apply (this is the entitlement itself, not access to previously
  purchased outside content in a reader context).
  This is the correct architecture to document in M10, not to build a workaround for.
- Recommend `react-native-iap` (or Expo's IAP/StoreKit config plugin path) with server-side
  receipt validation reusing the existing access-token issuance pattern (§H) — i.e. Apple/Google
  receipt validated server-side → mint the same kind of token `verify-session.mts` already
  mints today, so `check-access`/`generate-question`/`progress` don't need to know which
  storefront originated the entitlement.
- App Review will expect a working "Restore Purchases" flow and (per current guidelines) may
  ask about account deletion if the app supports account creation.
- Screenshots/App Store listing should not present the site's current waitlist-mode content
  as "live" — confirm launch state with the product owner before submission copy is written.

## Q. Recommended mobile architecture

React Native + Expo (managed workflow) + TypeScript, per Phase 3's stated preference and given
no scaffold constrains the choice otherwise:

```
src/
  api/            generateQuestionClient, checkoutClient, accessClient — typed fetch wrappers
                  around the 5 Netlify functions' existing contracts (§G)
  components/     presentational, no data-fetching
  content/        bundled JSON (imported from mobile-source/content-export at build time,
                  see M2) + the typed loader/normalizer that assigns stable IDs
  models/         TS types: Question (discriminated union on `type`), System, Lesson, Exam,
                  ExamProgress, Attempt, AccessToken, PricingPlan
  navigation/      strongly-typed React Navigation param lists
  screens/
  storage/        AsyncStorage-backed repositories (one per domain: attempts, examProgress,
                  onboarding, accessToken), versioned schema + migration runner
  services/       contentRepository, examEngine (state machine), scoringService,
                  pricingService, progressAnalyticsService
  utils/
  hooks/
  theme/          brand tokens from §J
```

Repository/service pattern per Phase 3: `contentRepository.getSystem(key)`,
`.getLesson(systemKey, index)`, `.getQuestions({system?, domain?, type?})`, `.getExam(examNum)` —
screens never touch the raw JSON.

## R. Recommended implementation sequence

Follow Phase 15's M1–M12 order as given, with two adjustments this audit surfaces:

- **M1** is a clean Expo init (no scaffold to extend — §A/O.1). Confirm with the user first if a
  real scaffold turns up; otherwise proceed on that basis.
- **M10** (pricing/access) should ship the *service abstraction* + documented App/Play research
  (§P) rather than a working purchase button, since the backend (`create-checkout.mts`, access
  tokens) doesn't yet support day-count/plan parameters on any platform (§H/O.2) — closing that
  gap is arguably web-repo work, and should be raised with the user as a separate decision before
  M10 starts, not assumed as in-scope for the mobile repo.

No other changes to the milestone order are recommended. Each milestone leaves the app runnable,
per Phase 15's requirement.
