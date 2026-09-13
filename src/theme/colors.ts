/**
 * ForgeFit color system — dark-first.
 *
 * The identity is a molten "forge" accent (ember orange -> electric lime) over
 * near-black graphite. Colors are chosen for AA contrast on the dark ground.
 */

export const palette = {
  // Ground / surfaces
  black: '#08080B',
  bg: '#0B0B0F',
  surface: '#14141B',
  surfaceAlt: '#1B1C25',
  surfaceHigh: '#23242F',
  hairline: '#2C2D3A',

  // Text
  text: '#F5F6FA',
  textDim: '#A9ADBF',
  textFaint: '#6C7085',

  // Brand — the "forge"
  ember: '#FF5A1F', // primary action
  emberDeep: '#E7430C',
  amber: '#FFB020',
  lime: '#C6F135', // energy / success accent
  electric: '#39E6C3',

  // Semantic
  success: '#3DDC84',
  warning: '#FFC24B',
  danger: '#FF4D5E',
  info: '#4C8DFF',

  // Ring / macro tokens
  calorie: '#FF5A1F',
  protein: '#39E6C3',
  carbs: '#FFB020',
  fat: '#C084FC',
  water: '#4CC2FF',
  steps: '#C6F135',
  sleep: '#8B93FF',

  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export type ColorToken = keyof typeof palette;

// Semantic aliases used across the UI layer.
export const colors = {
  ...palette,
  primary: palette.ember,
  onPrimary: '#160800',
  background: palette.bg,
  card: palette.surface,
  cardAlt: palette.surfaceAlt,
  border: palette.hairline,
} as const;

export const gradients = {
  forge: [palette.ember, palette.amber] as [string, string],
  ember: ['#FF7A3D', '#E7430C'] as [string, string],
  lime: ['#C6F135', '#39E6C3'] as [string, string],
  night: ['#14141B', '#0B0B0F'] as [string, string],
  discipline: ['#FF5A1F', '#C6F135'] as [string, string],
};
