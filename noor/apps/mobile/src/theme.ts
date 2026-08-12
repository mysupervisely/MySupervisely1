// Noor brand tokens — ported 1:1 from apps/patient/src/app/globals.css so
// the native app reads as the same product, not a reskin (M5 brief §4:
// "The app should feel like Noor, not like a generic Expo starter
// application"). See docs/noor/M2-IMPLEMENTATION.md "Brand" for the
// original sourcing note: an original interpretation of the brief's
// written brand description, not a verified match to real Noor Therapy
// Group assets.

export const colors = {
  cream: "#faf5ea",
  creamDeep: "#f2e9d8",
  white: "#fffdf9",

  ink: "#23252b",
  inkSoft: "#3a3d45",
  muted: "#6f6a60",

  gold: "#b3823f",
  goldDeep: "#96692f",
  goldTint: "#f1e3c8",

  border: "#e7dcc4",
  borderStrong: "#d9c9a3",

  error: "#a6432b",
  errorTint: "#f6e3dd",
} as const;

export const radius = {
  card: 20,
  field: 12,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Font family keys registered via expo-font in App.tsx
// (@expo-google-fonts/cormorant-garamond, @expo-google-fonts/dm-sans) —
// the same two families as the web app (Cormorant Garamond for
// display/headings, DM Sans for body/UI).
export const fonts = {
  display: "CormorantGaramond_600SemiBold",
  displayBold: "CormorantGaramond_700Bold",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemiBold: "DMSans_600SemiBold",
} as const;

// WCAG 2.5.5 / platform HIG minimum touch target, matching the web app's
// explicit 44px floor (apps/patient globals.css .noor-button).
export const minTouchTarget = 44;
