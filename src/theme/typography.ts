import { TextStyle } from 'react-native';

/**
 * Type system.
 *
 * Display, headings and metrics use Archivo (a wide grotesque that reads
 * athletic at heavy weights); body copy and labels use Inter for legibility at
 * small sizes. React Native does not synthesise weights for custom fonts, so
 * each variant names the exact family file rather than setting fontWeight.
 */

export const fontFamily = {
  displayBlack: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

/** Map passed to expo-font's useFonts(). */
export const FONT_MAP = {
  Archivo_700Bold: require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
  Archivo_800ExtraBold: require('@expo-google-fonts/archivo/800ExtraBold/Archivo_800ExtraBold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
};

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const;

type Variant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'metric'
  | 'metricLg'
  | 'overline';

export const typography: Record<Variant, TextStyle> = {
  display: { fontSize: 40, lineHeight: 46, fontFamily: fontFamily.displayBlack, letterSpacing: -1.2 },
  h1: { fontSize: 30, lineHeight: 36, fontFamily: fontFamily.displayBlack, letterSpacing: -0.9 },
  h2: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.displayBold, letterSpacing: -0.6 },
  h3: { fontSize: 19, lineHeight: 25, fontFamily: fontFamily.displayBold, letterSpacing: -0.35 },
  title: { fontSize: 17, lineHeight: 22, fontFamily: fontFamily.bodySemi, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fontFamily.bodyRegular },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontFamily: fontFamily.bodySemi, letterSpacing: -0.1 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.bodyMedium },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.bodyMedium },
  overline: { fontSize: 11, lineHeight: 14, fontFamily: fontFamily.bodyBold, letterSpacing: 1.4, textTransform: 'uppercase' },
  metric: { fontSize: 22, lineHeight: 27, fontFamily: fontFamily.displayBold, letterSpacing: -0.7 },
  metricLg: { fontSize: 36, lineHeight: 41, fontFamily: fontFamily.displayBlack, letterSpacing: -1.4 },
};
