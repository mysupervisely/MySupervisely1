# M3 UI Quality Review — App Store readiness pass

A deliberate audit of the Home/Body Map/System screen code as it stands after M3, done as if
preparing for App Store submission. Every finding below is either (a) computed directly from
real data (contrast ratios from the actual theme hex values and the actual
`body_map_diagram.png` pixels; hotspot-overlap distances from the actual `systems.json`
coordinates) or (b) a direct code-reading observation with a file reference — nothing here is
guessed from memory of what the screen "probably" looks like, since no simulator is available to
look at it directly (see `docs/demo/README.md`). None of these have been fixed yet — this is the
audit the task asked for; fixing is a scope decision for you to make (immediately, or deferred to
M11 polish alongside the items already listed in `docs/M3_IMPLEMENTATION_NOTES.md`).

## Color inconsistencies

1. **Hotspot marker contrast fails WCAG at all 8 real coordinates — computed, not estimated.**
   Sampled the actual pixel color in `body_map_diagram.png` at each of the 8 real anatomical
   hotspot coordinates (scaled from `systems.json`'s viewBox coordinates to the image's real
   808×1964 pixel space) and computed contrast against the hotspot's amber (`#DD9A32`) marker
   color:

   | System | Sampled backdrop pixel | Contrast vs. amber |
   |---|---|---|
   | cardio, endocrine, gi, neuro, renal, respiratory, rheum | `(255,255,255)` white | **2.40:1** |
   | uro | `(212,212,212)` light gray | **1.62:1** |

   Every single hotspot falls below the WCAG 1.4.11 non-text/UI-component minimum of **3:1**,
   let alone the 4.5:1 text minimum. The white ring border around each dot
   (`src/components/bodyMap/Hotspot.tsx`) helps separate it from the illustration's linework but
   doesn't fix the underlying marker-color contrast. **Recommend**: darken the marker (e.g.
   `colors.tealDeep` or `colors.flag` instead of `colors.amber`), or add a dark outline/shadow in
   addition to the white ring.
2. `colors.flag` (`#AE3B45`, the theme's semantic danger/incorrect red) is defined but not used
   anywhere in M1–M3 UI code — not a bug, but it means this token is still completely unverified
   in a real rendered screen.
3. The pulse ring and the dot both use the same `colors.amber` hue (`Hotspot.tsx`) — intentional,
   but combined with finding #1, the whole marker may read as a soft, hard-to-spot blob rather
   than a crisp target against lighter regions of the illustration.

## Alignment problems

4. **"More Topics" has an odd card count (19: 18 real systems + 1 synthesized) in a 2-column
   grid** (`HomeScreen.tsx`, `TopicCard.tsx`'s `width: '48%'`) — the last row renders a single
   card left-aligned with roughly half the row empty, an unfinished-looking terminal row.
5. `TopicCard`'s `48%` width + `spacing.sm` gap math only leaves 3–5pt of slack against
   `ScreenContainer`'s 24pt padding on 320–375pt-wide phones — tight but functional; **not
   adapted for tablet width at all**, so on an iPad the grid stays 2 columns with large empty
   gutters instead of reflowing to 3–4 columns.
6. Two different numeric-stat alignment conventions on the same app: `ProgressStats.tsx` centers
   its 3 stat values, while `SystemScreen.tsx`'s domain-distribution rows right-align the
   percentage in a fixed 36pt column — both reasonable in isolation, inconsistent side by side.

## Oversized or undersized touch targets

7. **Two hotspots' 44×44pt touch targets actually overlap at common phone widths — computed
   from the real coordinates**, not eyeballed:

   | Container width | GI ↔ Endocrine hotspot center distance | Overlaps 44pt targets? |
   |---|---|---|
   | 320pt (iPhone SE) | 35.8pt | **Yes** |
   | 375pt (standard iPhone) | 41.9pt | **Yes** |
   | 414pt (large iPhone) | 46.3pt | No — only 2.3pt of margin |
   | 768pt (iPad portrait) | 85.8pt | No |

   On an iPhone SE or standard-width iPhone, a tap aimed at GI or Endocrine can register on the
   other. This isn't a code bug (the 44pt touch-target implementation itself is correct and
   deliberate — see M3 notes) — it's that two of the real content coordinates in `systems.json`
   are close enough together that the *content data*, not the component, needs either tighter
   coordinates or a smaller/offset touch target for this specific pair. Flagging for whoever owns
   the coordinate data rather than silently shrinking touch targets below 44pt to route around
   it.
8. Renal↔Urology is the next-closest pair (69–92pt depending on width) — comfortably clear, no
   action needed, listed for contrast with #7.
9. `TopicCard`'s explicit `minHeight: 44` is never actually the binding constraint — real content
   (title + meta row) is always taller — so it's dead/redundant styling, not a defect.

## Typography issues

10. Primary CTA labels (`OnboardingScreen`'s "Get started," `SystemScreen`'s "Start Practice")
    use `typeScale.h3` — `SpaceGrotesk_500Medium` at 17px. Reasonable, but a bolder weight
    (600/700) is a common App-Store-quality convention for a primary action's visual weight; both
    buttons currently read at the same weight as a *secondary* action's label style elsewhere.
11. `HomeScreen`'s greeting (`typeScale.h1`) has no `numberOfLines`/truncation strategy — a long
    stored name (e.g. "Good afternoon, Alexandria-Marie") will wrap to 2 lines with no tested
    fallback for how that affects the header row's alignment with the logo.
12. `SystemScreen`'s domain-label column is a fixed `width: 72` — untested against larger
    Dynamic Type scales; "Domain 1" fits at default size but a fixed-width, non-`flexShrink`
    text container is a known clipping risk at accessibility text sizes.

## Spacing inconsistencies

13. `OnboardingScreen` doesn't use `ScreenContainer` (bespoke layout, `paddingHorizontal: spacing.xl` = 32pt)
    while every other screen inherits `ScreenContainer`'s `spacing.lg` = 24pt padding — Onboarding's
    horizontal margins don't match the rest of the app's.
14. "Body Map" gets a subtitle line under its section title; "More Topics" doesn't — an
    asymmetric section-header pattern between the two sections on the same screen.

## Accessibility concerns

15. (Cross-referenced from Color #1) — the hotspot contrast failure is also a WCAG accessibility
    finding, not just a visual-polish one.
16. `SystemScreen`'s domain-distribution bar exposes its label and percentage as two separate,
    disjointed `Text` reads for a screen reader (e.g. "Domain 3" ... then later "91%") with the
    bar `View` itself non-accessible in between — unlike `ProgressStats`, which correctly groups
    each stat into one combined `accessibilityLabel` ("3 of 5 lessons completed"). Inconsistent
    treatment of the same "labeled stat" pattern on the same screen.
17. **No `KeyboardAvoidingView` on `OnboardingScreen`.** Content is vertically centered
    (`justifyContent: 'center'`); on a small device the keyboard can cover the "Get started"
    button while the name field has focus, with no keyboard-aware repositioning to reveal it —
    a real usability barrier, more so for anyone relying on Switch Control or who can't easily
    dismiss the keyboard first.
18. The name `TextInput` sets `returnKeyType="done"` but has no `onSubmitEditing` handler —
    pressing the keyboard's "done" key does nothing, rather than acting like tapping "Get
    started." Inconsistent affordance for keyboard-driven/assistive input.
19. The tab bar (5 tabs: Home/QBank/Exams/Progress/Pricing) is label-only, no icons (a decision
    already flagged and deferred in `docs/M1_IMPLEMENTATION_NOTES.md`) — restated here because
    label-only tab bars are harder to scan at a glance, which matters more for low-vision users.

## Navigation friction

20. **"Start Practice" silently drops system context.** `SystemScreen.tsx`'s Start Practice
    button navigates to `QBankTab` with no system-filter parameter, because the M1-stub
    `QBankScreen` doesn't accept one yet. A user tapping Start Practice from, say, Cardiovascular
    lands in a generic, unfiltered QBank placeholder with no indication they came from
    Cardiovascular at all. Flagging now so M5's real QBank engine is designed to accept an
    initial system filter from this entry point, rather than this gap being rediscovered later.
21. "Continue" always opens lesson index 0 regardless of any prior progress — expected, since no
    progress tracking exists yet (M6/M7 resolve this naturally), but it's real friction today for
    anyone who's already partway through a system's lessons.

## Animation opportunities

22. **Inconsistent press feedback across the app's three interactive-element types on one
    screen.** `TopicCard` fades to 70% opacity on press (function-form `style` prop); `Hotspot`
    and `SystemScreen`'s Continue/Start Practice buttons use static styles with **no** press
    feedback at all. Three different "does this thing feel tappable" languages in the same
    screen.
23. The domain-distribution bar (`SystemScreen.tsx`) snaps to its final fill width instantly on
    mount rather than animating in — an animated fill-in is a common, inexpensive App-Store-
    quality touch for stat bars.
24. No haptic feedback (`expo-haptics`) on hotspot taps or primary button presses — a plausible
    polish addition for a "clinical/premium" feel; flagged as an opportunity, not a defect, and
    would be a new (small) dependency to weigh against the project's minimal-dependencies rule.
25. The hotspot pulse's timing/easing (`Hotspot.tsx`, 1600ms linear loop) was chosen to visually
    approximate the web app's CSS pulse by reading the CSS, not pixel/frame-measured against it —
    worth a side-by-side comparison once a simulator is available.
26. Screen transitions use React Navigation's plain platform defaults throughout — no jank, but
    no custom polish (e.g. a subtle shared-element transition from a tapped hotspot into its
    System screen) has been added.

## Summary

26 findings across all 8 requested categories. The single most concrete, evidence-backed pair
worth prioritizing first: **the hotspot color-contrast failure (finding #1, every one of the 8
real hotspots measured below WCAG minimums against the actual artwork)** and **the GI/Endocrine
touch-target overlap on standard-width phones (finding #7, measured from the real coordinate
data)** — both are real accessibility/usability defects, not stylistic nitpicks, and both were
confirmed by direct computation against the real assets and real content, not by inspection of a
rendered screen (which this environment can't produce — see `docs/demo/README.md`).
