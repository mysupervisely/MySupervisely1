# Real Device Test Plan — PharmDPrepped Mobile Beta

This sandbox has no iOS/Android simulator (verified repeatedly since M3 via `xcrun`,
`ANDROID_HOME`/`emulator`, and `/dev/kvm` checks) — every screenshot or "verified visually" claim
in this project's other docs is a description of code behavior, never a fabricated image. This
document is the bridge: exact steps for testing the real app on your own iPhone/Android device.

All dependencies in this app today (`@react-navigation/*`, `@react-native-async-storage/
async-storage`, `expo-font`, `expo-splash-screen`, `expo-status-bar`, `react-native-safe-area-
context`, `react-native-screens`, Google Fonts packages) are Expo Go-compatible — **no custom
native module requires a development build**. Expo Go is the fastest path; a dev build (via EAS,
`eas.json` already configured for it — see `docs/M10_IMPLEMENTATION_NOTES.md` "Environment
configuration") is only needed once a future milestone adds a module Expo Go doesn't support
(e.g. real in-app purchases).

## 1. Setup (one-time)

1. Install **Expo Go** from the App Store (iPhone) or Google Play (Android).
2. On your computer, in `mobile/`: `npm install` (if not already done).
3. Run `npx expo start` (or `npm start`). A QR code appears in the terminal and in the browser
   tab it opens.
4. **iPhone**: open the Camera app, point it at the QR code, tap the notification that appears —
   it opens directly in Expo Go.
   **Android**: open Expo Go, tap "Scan QR code," scan the terminal/browser QR code.
5. Your phone and computer must be on the **same Wi-Fi network** for this to work. If they can't
   see each other (e.g. restrictive network, VPN), run `npx expo start --tunnel` instead — slower,
   but works across networks.

If you'd rather build a standalone dev client instead of using Expo Go (e.g. to test with a real
device build closer to a production install): `npx eas-cli build --profile development --platform
ios` (or `android`) — requires a free/paid Expo account and, for iOS, an Apple Developer account
for device registration. Not required for the checklist below.

## 2. What you're testing

The app has no real backend deployed yet (`docs/M8_IMPLEMENTATION_NOTES.md` / `docs/
M9_IMPLEMENTATION_NOTES.md` "Base URL") — AI question generation and access-code verification will
correctly show **real network/backend error states**, not silently fail or crash. That's expected
and itself worth confirming (see 3.8/3.9 below) — it is not a bug in what you're testing.

Everything else — onboarding, body map, QBank, exams, progress/analytics, and all local
persistence — runs entirely off-device and should work exactly as described.

## 3. Checklist

Check off each item. Where something doesn't match the expected behavior, note the device/OS
version and exactly what happened — that's a real bug report, not a fabricated one.

### 3.1 Onboarding
- [ ] App opens directly to the onboarding screen (logo, "Master the NAPLEX one system at a
      time." concept line, name field, "Get started" button).
- [ ] Tapping the name field brings up the keyboard; the "Get started" button stays visible/
      reachable above the keyboard (not hidden behind it).
- [ ] Typing a name and pressing the keyboard's "done" key submits, same as tapping "Get started."
- [ ] Leaving the name field blank and tapping "Get started" still enters the app (name is
      optional).
- [ ] After entering the app, the Home screen's greeting uses the name you typed (e.g. "Good
      afternoon, Alex"); if left blank, a plain time-of-day greeting with no name.
- [ ] Force-quit and reopen the app — it goes straight to Home (not onboarding again), and the
      name is remembered.

### 3.2 Navigation
- [ ] All 5 tabs (Home, QBank, Exams, Progress, Pricing) are reachable and show distinct screens.
- [ ] Back navigation (iOS swipe-from-left-edge, Android back button/gesture) works on every
      nested screen (System, Lesson, Exam Taking/Review/Results, AI Practice setup/session, Study
      Session, Exam History) without the app crashing or landing somewhere unexpected.
- [ ] Tapping a body-map hotspot or a "More Topics" card opens that System's real content (real
      lesson count, real question count — not placeholder numbers).

### 3.3 Body Map
- [ ] All 8 anatomical hotspots (Cardiovascular, Neuro, Respiratory, GI, Endocrine, Renal,
      Urology, Rheum) are visible and tappable on the body illustration.
- [ ] Each hotspot's dot has a visible dark outline against the illustration (not just a bare
      amber dot) — confirm it's legible, not washed out, against both light and darker regions of
      the image.
- [ ] **GI and Endocrine specifically**: on a smaller phone (iPhone SE/mini or similar), tap
      several times near each one and confirm each tap reliably opens the *correct* system — this
      is the pair `docs/M3_QA_REVIEW.md` flagged as having touch-targets close enough to overlap;
      M10 nudged them apart programmatically (`docs/M10_IMPLEMENTATION_NOTES.md` "Body map
      polish") and this is the real-device check that it actually worked.
- [ ] Press and hold a hotspot briefly (don't release) — the dot should visibly change color
      (amber → red) while held, confirming press feedback.
- [ ] If your device has Reduce Motion enabled (iOS: Settings → Accessibility → Motion; Android:
      Settings → Accessibility → Remove animations), the pulsing ring around each hotspot should
      not animate. With it off, the pulse should animate continuously.

### 3.4 QBank
- [ ] Without any access unlocked, opening the QBank tab shows a locked message with an "Unlock
      Access" button (not a crash, not the actual questions).
- [ ] Tapping "Unlock Access" takes you to the Pricing tab.
- [ ] (After verifying access — see 3.8) QBank questions render with real stems/options; selecting
      an answer and tapping Submit locks the question and shows the rationale.
- [ ] Previous/Next work correctly; Next is disabled (greyed out) on the very last question rather
      than mislabeled.
- [ ] Force-quit mid-QBank-session and reopen — your position and prior answers are restored, not
      reset to question 1.
- [ ] "✨ Generate AI Practice Question" is visible only once QBank access is unlocked.

### 3.5 Progress
- [ ] With zero activity (fresh install), the Readiness Score card says "not enough data yet"
      rather than showing a bare, discouraging "0".
- [ ] After answering a few QBank questions, Progress reflects them (Total Answered, Overall
      Accuracy, System Performance, NAPLEX Domains) without needing to force-quit/reopen the app —
      just navigate to the Progress tab.
- [ ] "Recommended Study" and "Exam History" links work; each shows an understandable empty state
      before you've generated any data for them (not a blank white screen).

### 3.6 Exam
- [ ] The exam list shows all 3 exams with real status (Not Started/In Progress/Completed) without
      needing to unlock access first (browsing the list is free).
- [ ] Tapping "Start Exam" without access unlocked shows an alert explaining QBank access is
      required, with a link to Pricing — it does not silently start the exam.
- [ ] (After unlocking access) Start an exam: the timer counts down, the question palette shows
      answered/unanswered/flagged/current state correctly, flagging a question works.
- [ ] Force-quit mid-exam and reopen — the exam resumes at the same question with the same
      remaining time (not reset, not stuck).
- [ ] Reach the Review screen: unanswered count is accurate; submitting shows a confirmation
      dialog first, and if you have unanswered questions the dialog says so explicitly.
- [ ] After submitting, Results shows a real score/accuracy/domain breakdown, and "Review
      Questions" lets you page through every question read-only with the correct answer and
      rationale shown (including ones you didn't answer).

### 3.7 AI Questions
- [ ] From QBank (with access unlocked), tap "✨ Generate AI Practice Question."
- [ ] Pick a System, optionally a Topic and Difficulty, pick a NAPLEX Domain, tap "Generate
      Question."
- [ ] Since no backend is deployed yet, expect a clear error message (not a hang, not a crash) —
      confirm the message is readable and a "Try Again" button is present.
- [ ] Turn on Airplane Mode first, then try generating — confirm the error message specifically
      indicates a connection problem (not a generic/confusing one).

### 3.8 Access / Paywall
- [ ] Pricing tab shows three plan cards (Course Only / QBank Only / Course + QBank) with prices
      that change when you tap a different duration chip (3d/7d/.../365d) or type a custom day
      count.
- [ ] Tapping "Continue" on any plan shows an honest "coming soon" message — it does not open a
      web checkout page or claim to have charged you anything.
- [ ] Under "Already Purchased on the Web?", try entering a made-up access code and tapping
      Verify — expect a clear "not recognized"/connection-error message, not a hang or crash.

### 3.9 Offline Behavior
- [ ] Turn on Airplane Mode, then browse Home/Body Map/System screens, answer QBank questions,
      review Progress, and take an exam — all of this should work with **zero** difference from
      being online (nothing here touches the network).
- [ ] While still offline, open Pricing and try "Verify" on the restore-access form — expect a
      clear offline/connection error, not a hang.
- [ ] Turn Wi-Fi back on and repeat the AI-generation or access-verification attempt — it should
      recover normally (no leftover stuck "loading" state from the offline attempt).

### 3.10 App Restart / Resume
- [ ] Background the app (don't force-quit) mid-QBank-session, mid-exam, and on the Progress tab;
      switch back after a minute — everything should still be exactly where you left it.
- [ ] Force-quit and relaunch from a cold start at each of those same points — same expectation:
      QBank/exam position and all recorded progress survive a full app restart.

## 4. Reporting results

For anything that doesn't match the checklist, note: device model, OS version, which checklist
item, and exactly what you saw (a screenshot from your own device is genuinely useful here, since
this project's own tooling still can't produce one). Send that back and it becomes a real, testable
bug report rather than something re-derived from guesswork.
