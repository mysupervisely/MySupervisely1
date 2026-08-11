# Backend Deployment Plan — PharmDPrepped Netlify Backend

Audit + deployment plan only. Nothing was deployed, no credentials were requested, no secrets were
touched, and no mobile app code was changed to produce this document. Every claim below is either
(a) read directly from the files in `mobile-source/web-reference/` or (b) explicitly marked as
unverifiable from this environment, with the reason why.

## A. Current backend status

**There is no backend this session can deploy to, redeploy, or verify the live status of.**
`mobile-source/web-reference/` is a static **export** of a PharmDPrepped site — HTML, a data
file, and 5 Netlify Functions — not a live, connected Netlify project. Specifically:

- No `.netlify/state.json` (the file Netlify's CLI writes when a local folder is `netlify link`ed
  to a real site) exists anywhere under `mobile-source/`.
- No `.git` directory exists under `mobile-source/web-reference/` — it isn't even its own git
  repository, let alone one connected to Netlify's CI.
- No site ID, account reference, or deploy URL is recorded anywhere in `netlify.toml` or the
  function files (Netlify site IDs aren't something a `netlify.toml` normally contains anyway —
  that link lives in Netlify's own account records, which this session has no access to).

In short: **this is source code, not a deployment.** Whether *some* real Netlify site was ever
created from these exact files — and whether it's still live — is not something this repository
or session has any record of.

## B. Existing Netlify deployment

**Unverifiable from this environment**, for two independent reasons:

1. **No account access.** Nothing in this repo grants access to any Netlify account, so there's
   no way to check "does a site exist" the normal way (logging in and looking).
2. **One concrete, real clue exists, but I could not check it.** `create-checkout.mts` (line 10)
   hardcodes a fallback: `Netlify.env.get("URL") || "https://pharmdprepped.netlify.app"`. Netlify
   automatically injects the real `URL` env var at runtime for any deployed site, so a fallback
   value like this is normally written to *match* the domain the developer expected the site to
   actually be deployed at. That's real evidence a site named `pharmdprepped` on Netlify's
   `.netlify.app` domain may have existed at some point — **but I attempted to check whether
   `https://pharmdprepped.netlify.app` currently responds, and this sandbox's outbound network
   policy blocked the request** (`CONNECT tunnel failed, response 403` — the domain isn't on this
   environment's allowlist). That's an inconclusive result, not evidence either way.

**What I need you to do (safe, no login, no credentials):** open **https://pharmdprepped.netlify.app**
in your own browser. Three possible outcomes:
- It loads the real PharmDPrepped marketing site → a deployment exists and is live today.
- It shows Netlify's "site not found" page → that name isn't claimed / isn't live right now.
- It loads *something else entirely* → someone else owns that name on Netlify; pick a different
  site name when deploying (see §G).

Report back which of the three you saw — that single fact determines whether §G's deployment
steps are "create a new site" or "you may already have one, check your Netlify account for it."

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

## G. Exact deployment steps

Two different situations, depending on what you found in §B:

### If `pharmdprepped.netlify.app` already loads the real site
A deployment exists. You (or whoever owns that Netlify account) need to:
1. Log into **app.netlify.com** with the account that owns it.
2. Go to that site → **Site configuration → Environment variables** → confirm whether
   `ANTHROPIC_API_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` are already set. If any are
   missing, add them there (paste the values directly into Netlify's UI — never into this chat).
3. If you just added/changed any variable, trigger a redeploy: **Deploys → Trigger deploy →
   Deploy site** (env var changes need a fresh deploy to reach running functions).
4. Confirm it's live: visiting `https://pharmdprepped.netlify.app/api/check-access?token=test`
   in a browser should return `{"valid":false}` (not a 404, not a server error) — that alone
   confirms the functions are deployed and reachable, with no login needed to check it.

### If that domain is unclaimed, or shows someone else's site
No reusable deployment exists that we know of. Fastest real path, using exactly the files already
in this repo:
1. Go to **app.netlify.com** and log in (or create a free account) — in your own browser.
2. Click **"Add new site" → "Deploy manually"** (Netlify's drag-and-drop deploy option — no git
   connection required for this).
3. On your own computer, get a copy of the `mobile-source/web-reference/` folder from this repo,
   and drag that folder onto Netlify's upload area. Netlify will read `netlify.toml`
   automatically, detect the `netlify/functions` directory, and deploy both the static site and
   all 5 functions in one step.
4. Once it finishes, Netlify assigns a random name like `https://<random-words>.netlify.app`. In
   **Site configuration → General → Site details → Change site name**, you can try to claim
   `pharmdprepped` specifically (so the final URL is `https://pharmdprepped.netlify.app`, matching
   what the code itself already expects as its fallback) — if that name is already taken by
   someone unrelated, pick another and just note the real URL you end up with.
5. Go to **Site configuration → Environment variables → Add a variable**, and add all three from
   §D (paste values directly into Netlify's UI, never into this chat).
6. **Deploys → Trigger deploy → Deploy site** — required once after adding the env vars, so the
   functions actually pick them up.
7. Verify the same way as above: `https://<your-real-site>.netlify.app/api/check-access?token=test`
   should return `{"valid":false}`, not an error.

**Manual drag-and-drop deploy is the fastest way to get a real, working URL for a beta test today**
— the tradeoff is no git history and no auto-redeploy-on-push; every future change to this backend
would need to be re-dragged-and-dropped by hand. If this backend is going to be maintained
long-term, connecting a real git repository to Netlify (Netlify → "Import from Git") is the better
long-term choice, but that requires the PharmDPrepped site source to actually live in its own git
repository somewhere first, which isn't something this session has visibility into.

## H. Final API URL needed by mobile

**Cannot be stated as a real, working value yet — and won't be guessed.** Once §G is complete
(either path), the real value is whatever Netlify actually assigns or whatever custom domain you
configure — something of the shape `https://pharmdprepped.netlify.app` or
`https://<your-chosen-name>.netlify.app`.

Once you have that real URL, tell me what it is and I'll set
`EXPO_PUBLIC_API_BASE_URL` in `mobile/.env.development`/`.env.preview` to it (a small, mechanical
config edit — the same one-line change `docs/M10_IMPLEMENTATION_NOTES.md` already flagged as the
only thing needed once a real backend exists). I have not made that change yet, since there is no
real URL to put there.

## I. Recommended next milestone

Not started — a recommendation only, per your instruction not to begin M11:

1. You complete §B's check and §G's deployment (your action, browser-only, no code from this
   session involved).
2. Give me the real resulting URL → I update `EXPO_PUBLIC_API_BASE_URL` (one-line config change,
   already scoped and understood, nothing new to design).
3. Re-run the AI-generation and access-verification flows from `docs/REAL_DEVICE_TEST_PLAN.md`
   against the real backend — this is the first time those two features can be tested as
   "working," not just "fails gracefully."
4. *Then* — a real milestone decision point, not this session's call to make unilaterally —
   decide whether the next step is the EAS/Apple Developer path (installable iPhone build) or
   closing the backend gaps in §F first (token plan/expiry, checkout plan/day params) before
   testing a purchase-adjacent flow for real.

Native IAP, App/Play Store work, and any further mobile code changes remain explicitly out of
scope until you say otherwise.
