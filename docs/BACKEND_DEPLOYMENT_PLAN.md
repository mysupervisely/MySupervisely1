# Backend Deployment Plan — PharmDPrepped Netlify Backend

Audit + deployment plan only. Nothing has been deployed, no credentials were requested, no secrets
were touched, and no mobile app code was changed to produce this document. Every claim below is
either (a) read directly from the files in `mobile-source/web-reference/`, (b) a safe, read-only,
side-effect-free check you can run yourself in a browser (given below, exact URLs), or (c)
explicitly marked as unverifiable from this environment, with the reason why.

**Update (this revision): you confirmed `https://pharmdprepped.netlify.app` is live and is the
real PharmDPrepped deployment.** Do not create a new Netlify site — everything below is now about
connecting/completing *that* existing site, not starting a new one. §B/§G/§H are rewritten for
this; §C/§D/§E/§F are the same audit as before (still accurate, not affected by which site it is).

## A. Current backend status

**This repository holds the backend's source code, not a connection to the live site.**
`mobile-source/web-reference/` (HTML, a data file, and 5 Netlify Functions) is what a real,
now-confirmed-live site should be running — but nothing here proves the *live* site is currently
running this *exact* code:

- No `.netlify/state.json` (the file Netlify's CLI writes when a local folder is `netlify link`ed
  to a real site) exists anywhere under `mobile-source/`.
- No `.git` directory exists under `mobile-source/web-reference/` — it isn't its own git
  repository, so this session has no way to tell whether the live site deploys from this exact
  folder, from a different repository entirely, or from a one-time manual upload that's since
  gone stale.
- No site ID or account reference is recorded anywhere in `netlify.toml` or the function files.

The safe, read-only checks in §G below are how to close that gap without needing dashboard access
at all.

## B. Existing Netlify deployment

**Confirmed live by you:** `https://pharmdprepped.netlify.app` is the real PharmDPrepped
deployment. This matches the one concrete clue found in the code — `create-checkout.mts` (line
10) hardcodes `Netlify.env.get("URL") || "https://pharmdprepped.netlify.app"` as its fallback,
which is exactly the kind of value a developer writes to match the domain they expect the site to
actually be running on.

**What's still unconfirmed: whether that live site includes the 5 backend functions, or is
static-content-only.** A Netlify site can absolutely have its marketing pages live and working
while its `netlify/functions` folder was never deployed (e.g. if it was ever pushed from a
different source, or from an earlier version of the folder before the functions existed, or via a
build step that only publishes the static files). This session still cannot log into Netlify to
check the "Functions" tab directly — but it doesn't need to, because every function is safely,
individually checkable from a browser, with no login and no side effects. See §G.

## C. Existing functions

All 5 functions in `mobile-source/web-reference/netlify/functions/` are **code-complete,
internally consistent, and were already audited for correctness** across M8/M9 — no bugs found in
this pass either. None of them can run anywhere until *some* real Netlify site exists to host
them (Netlify Functions don't run standalone).

| Function | Path | Purpose | Env vars it reads |
|---|---|---|---|
| `generate-question.mts` | `POST /api/generate-question` | Token-gated proxy to Anthropic; model is pinned server-side (`claude-sonnet-4-6`), never client-supplied | `ANTHROPIC_API_KEY` |
| `create-checkout.mts` | `POST /api/create-checkout` | Creates a Stripe Checkout Session for one fixed price/quantity | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `URL` (auto) |
| `verify-session.mts` | `GET /api/verify-session?session_id=` | Confirms a paid Stripe session, mints an access token in Netlify Blobs | `STRIPE_SECRET_KEY` |
| `check-access.mts` | `GET /api/check-access?token=` | Looks up a token in Netlify Blobs, returns `{valid}` | none |
| `progress.mts` | `GET/POST /api/progress` | Generic per-token key/value store in Netlify Blobs | none |

`check-access.mts`/`progress.mts`/`generate-question.mts`/`verify-session.mts` all use
**Netlify Blobs** (`getStore(...)`) — this is a Netlify-native storage feature tied directly to
the site itself; it needs no separate account, service, or env var to "turn on," it just works
once the functions are deployed to a real site.

## D. Required environment variables

Exactly three secrets need to be set, all in **Netlify's dashboard** (Site settings →
Environment variables) — never in `netlify.toml`, never committed to any repo:

| Variable | Used by | What it is |
|---|---|---|
| `ANTHROPIC_API_KEY` | `generate-question.mts` | An Anthropic API key with access to the `claude-sonnet-4-6` model (the function pins this model server-side and does not let the client override it) |
| `STRIPE_SECRET_KEY` | `create-checkout.mts`, `verify-session.mts` | A Stripe secret key (test-mode `sk_test_...` is enough for beta; live-mode `sk_live_...` only once real charges are intended) |
| `STRIPE_PRICE_ID` | `create-checkout.mts` | The ID of a Stripe **Price** object (created in the Stripe dashboard ahead of time) — `create-checkout.mts` always checks out exactly this one price/quantity, regardless of what any pricing calculator (web or mobile) displays (see §F) |

`URL` is **not** something you set — Netlify injects it automatically at runtime with the site's
own real address, which is exactly what `create-checkout.mts` reads it for.

## E. Security requirements

- **Never** put `ANTHROPIC_API_KEY` or `STRIPE_SECRET_KEY` in `netlify.toml`, in any committed
  file, or in a mobile `.env.*` file — Netlify's dashboard environment-variable UI is the only
  correct place for them (confirmed: no function file hardcodes a key anywhere).
- All 5 functions were already re-confirmed to never leak a key to the client — `generate-
  question.mts` forwards only `{content, ...}` from Anthropic's response, never headers/keys;
  errors return a generic message, not raw provider errors.
- The access-token gate on `generate-question.mts`/`progress.mts` already prevents anonymous use
  — a real, valid token is required. `check-access.mts` is intentionally open (a read-only "is
  this real" check has to be, to be useful).
- **Real gap, not yet fixed anywhere:** there is **no rate limiting** on any function. A single
  valid (e.g. shared or leaked) access token could call `generate-question` as many times as
  someone wants, at your Anthropic billing cost. Worth addressing (e.g. a per-token per-day cap
  stored in Blobs) before a wide beta, not just this one.
- **Real gap:** no Stripe webhook handler exists. `verify-session.mts`'s synchronous "check by
  session_id when the user lands on the success page" pattern is a reasonable minimum, but has no
  fallback if the user closes the tab before landing there, and doesn't react to
  refunds/disputes. Not blocking for a beta that isn't processing real payments yet (see §F/§I).
- CORS headers aren't set on any function. This doesn't block the **mobile** app (native `fetch`
  calls aren't subject to browser CORS at all), only matters if a browser-based client ever calls
  these cross-origin — flagging for completeness, not a mobile blocker.

## F. Missing backend functionality

All previously documented (`docs/MOBILE_PAYMENT_ARCHITECTURE.md` §3/§8), reconfirmed here, not
newly discovered — restated because this plan is meant to stand on its own:

1. **Access tokens have no `plan`, `days`, or `expiresAt` fields.** A token is valid forever, for
   everything, the moment it's minted. Mobile's `AccessService` already handles this gracefully
   (treats a valid token as granting every plan, never expiring) — but the real "pay for N days of
   QBank access" product isn't enforceable server-side yet.
2. **`create-checkout.mts` takes no plan/day-count parameters.** It always checks out one fixed
   price. The pricing calculator (web and mobile) computes a real, variable price, but nothing
   backend-side can charge that computed amount today.
3. **No Apple/Google receipt-validation endpoints exist.** Required before mobile can sell access
   via real in-app purchase (out of scope for this plan and for right now, per your instruction
   not to start native IAP).

None of these block a **beta test of the app's UX** — they block the *real, priced, enforced*
purchase flow, which isn't being tested yet either.

## G. Exact steps — connecting to the EXISTING live site

No new site. Everything here works with `https://pharmdprepped.netlify.app` as it already exists.

### Step 1 — Safe, read-only checks you (or I, if you paste me the results) can run first, no login needed

Each of these is a plain URL — visit it in any browser. None of them charge money, create a real
record, or require being logged into anything. They tell us, right now, whether the live site's
functions are actually deployed and (for two of them) whether the required secrets are set:

| Visit this URL | If the function IS deployed | If it's NOT deployed |
|---|---|---|
| `https://pharmdprepped.netlify.app/api/check-access?token=beta-test-check` | `{"valid":false}` | Netlify's 404 "Page not found" |
| `https://pharmdprepped.netlify.app/api/generate-question` | Plain text `Method not allowed` (it's POST-only; a browser visit is a GET) | 404 |
| `https://pharmdprepped.netlify.app/api/create-checkout` | Plain text `Method not allowed` | 404 |
| `https://pharmdprepped.netlify.app/api/verify-session` | `{"error":"Missing session_id"}` | 404 |
| `https://pharmdprepped.netlify.app/api/verify-session?session_id=beta_test_fake_id` | Either `{"error":"Stripe not configured"}` (means `STRIPE_SECRET_KEY` is **not** set) or `{"valid":false}` (means it **is** set — Stripe rejected the made-up ID, which is expected) | 404 |

The `check-access` and both `verify-session` checks above are the most informative: getting real
JSON back (rather than Netlify's generic 404 page) proves the functions folder is actually live on
this site, not just the static marketing pages.

**Tell me what each of these actually returned and I can tell you precisely what's deployed and
what (if anything) is still missing, without needing your Netlify login at all.**

### Step 2 — Check (and if needed, set) the environment variables — requires your Netlify login

This part does need you in the Netlify dashboard — there's no way to check configured environment
variable *names* (values are always hidden) without it:

1. Go to **app.netlify.com** and log in with the account that owns the `pharmdprepped` site.
2. Click into the **pharmdprepped** site.
3. Go to **Site configuration → Environment variables** (left-hand menu once you're inside the
   site, not the account-level settings).
4. You'll see a list of variable **names** (Netlify never shows values once saved, by design).
   Check whether `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_PRICE_ID` are already
   listed there.
   - **All three present** → the backend should already be fully configured; Step 1's checks
     should confirm this.
   - **Some or all missing** → click **"Add a variable"** for each missing one, and paste the
     real value directly into Netlify's form field — never into this chat, never into any AI tool.
5. **If you added or changed anything in step 4**, go to **Deploys** (top nav) → **Trigger
   deploy → Deploy site**. Environment variable changes don't reach already-running functions
   until a fresh deploy runs.
6. Re-run Step 1's checks afterward to confirm.

### Step 3 — Confirming the deployed code matches this repo's copy

Still in the site's dashboard: **Deploys** shows the deploy history, and **Site configuration →
Build & deploy → Continuous deployment** shows whether this site is connected to a git repository
at all (and which one, if so).

- **If it shows a connected GitHub/GitLab/Bitbucket repo**: that repository — not this one — is
  the real source of truth for this backend. Any future change to `generate-question.mts` etc.
  needs to happen there; this repo's `mobile-source/web-reference/` copy is a reference snapshot,
  not the live source.
- **If it shows no connected repository** ("Deploys are triggered manually" or similar): the site
  is running whatever was last manually uploaded, and Step 1's checks are the only way to know
  what that currently includes. Reconnecting or re-uploading in the future would use the same
  drag-and-drop flow described in earlier revisions of this document (Netlify → the site → Deploys
  → drag a folder onto the deploy area) — not needed right now if Step 1 already shows everything
  working.

I'm not asking you to change this connection or upload anything new right now — just to look, so
we both know which situation we're in before any future change is planned.

## H. Final API URL needed by mobile

**`https://pharmdprepped.netlify.app`** — this is now a real, confirmed-live domain, not a guess.

I have **not** put this into `mobile/.env.*` yet, on purpose — per your instruction not to modify
the mobile app yet, and because §G Step 1 hasn't been confirmed to show working functions there.
Once you've run (or shared the results of) §G Step 1's checks and confirmed the three env vars in
Step 2, tell me and I'll make the one-line change: `EXPO_PUBLIC_API_BASE_URL=https://pharmdprepped.netlify.app`
in `mobile/.env.development` and `.env.preview` — that's the entire mobile-side change needed,
already scoped since M10, nothing new to design.

## I. Recommended next milestone

Not started — a recommendation only, per your instruction not to begin M11:

1. You run §G Step 1's checks (or Steps 2/3 if Step 1 shows something's missing) and tell me the
   results.
2. Once confirmed working, I make the one-line `EXPO_PUBLIC_API_BASE_URL` change (§H) — the only
   mobile-side change this whole process needs.
3. Re-run the AI-generation and access-verification flows from `docs/REAL_DEVICE_TEST_PLAN.md`
   against the real backend — this is the first time those two features can be tested as
   "working," not just "fails gracefully."
4. *Then* — a real milestone decision point, not this session's call to make unilaterally —
   decide whether the next step is the EAS/Apple Developer path (installable iPhone build) or
   closing the backend gaps in §F first (token plan/expiry, checkout plan/day params) before
   testing a purchase-adjacent flow for real.

Native IAP, App/Play Store work, and any further mobile code changes remain explicitly out of
scope until you say otherwise.

## J. 502 diagnosis and dependency fix (applied)

**Result of §G Step 1 (as you ran it):** `check-access`, `generate-question`, and `verify-session`
all returned **502 Bad Gateway**. `create-checkout` returned **405 Method Not Allowed** — the
expected "deployed and working" response for a GET to a POST-only function.

**Root cause (high confidence, local static diagnosis — Netlify's own function logs were
unreachable, dashboard page wouldn't load):**
`mobile-source/web-reference/package.json` declared **zero dependencies** and had no lockfile and
no `node_modules`, even though 4 of the 5 functions do a real, runtime value import —
`import { getStore } from "@netlify/blobs"`. `create-checkout.mts` is the one function that does
**not** import `@netlify/blobs` (it only does `import type {...} from "@netlify/functions"`,
which is erased entirely by the TypeScript/esbuild bundler and never needs to resolve at
runtime) — which is exactly why it was the one function still working normally.

**Supporting evidence, not just correlation:** `generate-question.mts` and `verify-session.mts`
both have an early, completely `@netlify/blobs`-independent check as the very first thing their
handler does (`if (req.method !== "POST") return 405`, and
`if (!sessionId) return 400 "Missing session_id"`, respectively). Both requests still came back as
502 instead of hitting those checks. That rules out "the Blobs call itself throws deep inside the
handler" and points specifically at the whole module failing to load — i.e. the
`import { getStore } from "@netlify/blobs"` line itself, at the top of the file, failing because
the package was never declared as installable.

**Fix applied (commit `fe8e1a7`, pushed to this branch):**
- `mobile-source/web-reference/package.json` — added `@netlify/blobs: ^10.7.12` under
  `dependencies` (it's a real runtime import in 4 of the 5 functions), and
  `@netlify/functions: ^5.3.0` under `devDependencies` (type-only in every function — kept as a
  dev dependency for editor/type-checking correctness, not needed at runtime).
- `mobile-source/web-reference/package-lock.json` — generated fresh (none existed before).
- **No function logic changed. No try/catch added. No mobile app changes. No secrets touched.**
- Verified locally: `npm install` resolved both packages cleanly with no conflicts; a plain Node
  `require('@netlify/blobs')` and a dynamic ESM `import('@netlify/blobs')` both succeeded.
- Re-ran `mobile/`'s full existing suite as a safety check that the unrelated React Native app
  wasn't affected (it wasn't touched, but confirming anyway): `tsc --noEmit` clean, `eslint .`
  clean, `jest` — 28 suites / 343 tests, all passing.

**Other causes considered and ruled out:**
- Node version mismatch — both packages' `engines` fields (`@netlify/blobs` needs Node `^14.16.0
  || >=16.0.0`, `@netlify/functions` needs `>=18.0.0`) are far below any plausible Netlify
  Functions runtime version; not a plausible cause.
- `netlify.toml` misconfiguration — `[functions] directory = "netlify/functions"` matches the
  actual folder exactly; not the cause.
- A bad value/format in one specific function file — ruled out by `create-checkout.mts` (no
  `@netlify/blobs` import) working normally while all 3 `@netlify/blobs`-importing functions
  tested all failed identically.
- `progress.mts` was not part of the 5 safe checks (it needs a token), but shares the exact same
  `import { getStore } from "@netlify/blobs"` shape as the 3 confirmed-failing functions — the fix
  applies to it equally.

## K. Redeployment steps for the existing `pharmdprepped` site

The fix is committed and pushed to this repo's branch
(`claude/pharmdprepped-react-native-vao3jr`, commit `fe8e1a7`) — but that alone does **not**
redeploy anything. Which of the two steps below applies depends on §G Step 3 (still unconfirmed):
whether the live site is git-connected, or manually/drag-and-drop deployed. Do whichever matches
what Step 3 showed you; if you haven't checked yet, check that first — it tells you which of these
two paths to use.

### If §G Step 3 showed a connected git repository

Netlify needs the fix to reach *that* repository, not necessarily this one:

1. If the connected repo **is** `mysupervisely/mysupervisely1` (this repo) on this same branch —
   Netlify should pick up commit `fe8e1a7` automatically on its next build (most Netlify git
   integrations auto-deploy on push). Check **Deploys** in the site dashboard for a new deploy
   labeled with that branch/commit; if `autoPublish` is off, click **Publish deploy** once it
   finishes.
2. If the connected repo is **different** from this one (a separate, possibly private repo that
   actually hosts `pharmdprepped`'s source) — the same two-line fix
   (`mobile-source/web-reference/package.json` dependencies block shown in §J, plus a fresh
   `npm install` to produce a matching lockfile) needs to be applied there instead. I cannot do
   this from here without that repository being added to this session. Tell me if that's the case
   and, if you're able to, share that repo so I can apply the identical change there.
3. Either way, after the deploy finishes: re-run §G Step 1's 5 checks.

### If §G Step 3 showed no connected repository (manual/drag-and-drop deploys)

1. Log into **app.netlify.com**, open the **pharmdprepped** site.
2. Go to **Deploys** (top nav).
3. Drag the entire `mobile-source/web-reference/` folder (from this repo, with the fix already
   applied — i.e. as it exists in this repo right now, including the new `package-lock.json`) onto
   the deploy area, exactly as previous manual deploys were done.
4. Wait for the deploy to finish and show **Published**.
5. Re-run §G Step 1's 5 checks.

### Either path — what "fixed" looks like

Using the exact same 5 checks already used once:

| URL | Before (observed) | Expected after this fix |
|---|---|---|
| `/api/check-access?token=beta-test-check` | 502 | `{"valid":false}` (or another normal, non-502 JSON response) |
| `/api/generate-question` (GET) | 502 | `Method not allowed` (405) |
| `/api/create-checkout` (GET) | 405 (already correct) | 405 (unchanged — this one was never broken) |
| `/api/verify-session` (no params) | 502 | `{"error":"Missing session_id"}` (400-style) |
| `/api/verify-session?session_id=beta_test_fake_id` | 502 | `{"error":"Stripe not configured"}` or `{"valid":false}` — either is fine, just **not** 502 |

If any of the three previously-502ing endpoints still 502s after a confirmed-successful
redeploy, that means the dependency fix wasn't sufficient by itself and there's a second,
still-undiagnosed issue — report back which specific URL(s) still fail and I'll take the next
diagnostic step from there. **I am not re-testing these myself right now** (this environment's
network policy still blocks direct requests to this domain) — the next step is for you to run
these 5 checks after redeploying and report the results, per your instruction to stop here.

## WHAT I NEED TO DO

1. If not already known: check **Site configuration → Build & deploy → Continuous deployment**
   (§G Step 3) to see whether `pharmdprepped` is git-connected or manually deployed — this decides
   which of §K's two redeployment paths to use.
2. Redeploy using whichever §K path applies (auto-deploy / publish a pending deploy / manual
   drag-and-drop of `mobile-source/web-reference/`).
3. Re-run the 5 §G Step 1 checks (also restated in §K) and tell me the results.
4. Still separately, whenever convenient: confirm in **Site configuration → Environment
   variables** whether `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_PRICE_ID` are set
   (§G Step 2) — the dependency fix alone won't produce fully "working" responses from
   `generate-question`/`create-checkout` if those are still missing, only non-502 responses.

Nothing else. No Expo account, no Apple Developer account, no further code changes — waiting on
the post-redeploy check results before anything else happens.
