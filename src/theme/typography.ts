import { TextStyle } from 'react-native';

/**
 * Type scale — large, confident headings for a premium feel.
 * We rely on the platform system font by default and expose weight tokens so a
 * custom display font (e.g. an Inter / Sora pairing) can be dropped in later
 * via expo-font without touching call sites.
 */
export const fontFamily = {
  // Overridden at runtime once custom fonts load; falls back to system.
  display: undefined as string | undefined,
  body: undefined as string | undefined,
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
  display: { fontSize: 40, lineHeight: 44, fontWeight: weight.black, letterSpacing: -0.5 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: weight.bold, letterSpacing: -0.4 },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: weight.bold, letterSpacing: -0.3 },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: weight.semibold, letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: weight.semibold },
  body: { fontSize: 15, lineHeight: 22, fontWeight: weight.regular },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: weight.semibold },
  label: { fontSize: 13, lineHeight: 18, fontWeight: weight.medium },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: weight.medium },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: weight.bold, letterSpacing: 1.2, textTransform: 'uppercase' },
  metric: { fontSize: 22, lineHeight: 26, fontWeight: weight.bold, letterSpacing: -0.3 },
  metricLg: { fontSize: 34, lineHeight: 38, fontWeight: weight.black, letterSpacing: -0.6 },
};
