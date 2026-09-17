export * from './colors';
export * from './typography';
export * from './webStyle';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: {
    shadowColor: '#FF5A1F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;

export const layout = {
  screenPadding: 20,
  maxContentWidth: 520,
  tabBarHeight: 64,
} as const;

/**
 * Surface elevation.
 *
 * Every panel in the app was the same fill at the same radius with the same
 * rim, so a hero, a list row and a well all read at one level and the eye had
 * nothing to climb. These four steps give a screen a top and a bottom.
 *
 * `sunken` is genuinely darker than the page ground — a well things sit inside,
 * used for tracks, strips and grids. `floating` is the only level that gets a
 * wide shadow, so it stays rare enough to mean something.
 */
export type Elevation = 'sunken' | 'flat' | 'raised' | 'floating';

export const elevation: Record<
  Elevation,
  { fill: [string, string]; rim: string; rimTop: string; shadow: string; radius: number }
> = {
  sunken: {
    fill: ['#0C0D14', '#0A0B11'],
    rim: 'rgba(0,0,0,0.5)',
    rimTop: 'rgba(0,0,0,0.35)',
    shadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
    radius: 14,
  },
  flat: {
    fill: ['#15171F', '#12141B'],
    rim: 'rgba(255,255,255,0.05)',
    rimTop: 'rgba(255,255,255,0.06)',
    shadow: 'none',
    radius: 16,
  },
  raised: {
    fill: ['#1A1C26', '#131520'],
    rim: 'rgba(255,255,255,0.07)',
    rimTop: 'rgba(255,255,255,0.10)',
    shadow: '0 6px 18px rgba(0,0,0,0.32)',
    radius: 16,
  },
  floating: {
    fill: ['#22252F', '#181B24'],
    rim: 'rgba(255,255,255,0.11)',
    rimTop: 'rgba(255,255,255,0.18)',
    shadow: '0 18px 40px rgba(0,0,0,0.55)',
    radius: 20,
  },
};

/**
 * Per-domain accent. Five tabs that all glow ember make the whole app one
 * temperature; giving each area its own hue means a screenshot tells you where
 * you are before you have read a word.
 */
export const domainAccent = {
  home: '#FF5A1F',
  training: '#FF5A1F',
  nutrition: '#F2530F',
  progress: '#C6F135',
  profile: '#7FB2FF',
  gyms: '#39E6C3',
} as const;

/** Spring presets, so motion across the app has one physical character. */
export const springs = {
  press: { stiffness: 420, damping: 26, mass: 0.7 },
  enter: { stiffness: 220, damping: 24, mass: 0.9 },
  bounce: { stiffness: 300, damping: 14, mass: 0.8 },
} as const;
