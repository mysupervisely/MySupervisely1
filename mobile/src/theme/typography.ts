/**
 * Type system. Font families mirror the three families loaded on the web
 * app (audit §J): Space Grotesk for display/headings, Source Serif 4 for
 * body copy, IBM Plex Mono for numeric/mono UI chrome (timers, pill labels,
 * domain tags). Family name strings must match the keys registered with
 * `useFonts` in `theme/fonts.ts` exactly.
 */

export const fontFamily = {
  displayRegular: 'SpaceGrotesk_400Regular',
  displayMedium: 'SpaceGrotesk_500Medium',
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',

  bodyRegular: 'SourceSerif4_400Regular',
  bodyMedium: 'SourceSerif4_500Medium',
  bodySemiBold: 'SourceSerif4_600SemiBold',

  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

/** Named type scale. Keep new sizes here rather than inlining numbers in screens. */
export const typeScale = {
  display: { fontFamily: fontFamily.displaySemiBold, fontSize: 30, lineHeight: 36 },
  h1: { fontFamily: fontFamily.displaySemiBold, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fontFamily.displaySemiBold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fontFamily.displayMedium, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamily.bodyRegular, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fontFamily.monoRegular, fontSize: 13, lineHeight: 18 },
  monoLabel: { fontFamily: fontFamily.monoMedium, fontSize: 11, lineHeight: 14 },
} as const;

export type TypeScaleToken = keyof typeof typeScale;
