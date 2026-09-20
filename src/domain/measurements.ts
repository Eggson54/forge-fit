import type { Goal, MeasurementLog, MuscleGroup } from './types';

export type MeasurementKey = 'chestCm' | 'waistCm' | 'hipsCm' | 'armCm' | 'thighCm' | 'neckCm';

export interface MeasurementSite {
  key: MeasurementKey;
  label: string;
  /** Where the tape goes. Shown under the field so entries stay comparable. */
  hint: string;
  /** Lit on the figure when this field is focused. */
  muscle: MuscleGroup;
  /**
   * Whether this site mostly tracks fat rather than muscle. It decides which
   * direction counts as progress, and that flips with the user's goal.
   */
  tracksFat: boolean;
}

export const MEASUREMENT_SITES: MeasurementSite[] = [
  { key: 'chestCm', label: 'Chest', hint: 'Across the nipple line, arms down', muscle: 'chest', tracksFat: false },
  { key: 'waistCm', label: 'Waist', hint: 'At the navel, relaxed', muscle: 'core', tracksFat: true },
  { key: 'hipsCm', label: 'Hips', hint: 'Widest point of the glutes', muscle: 'glutes', tracksFat: true },
  { key: 'armCm', label: 'Arm', hint: 'Mid-bicep, flexed or relaxed — be consistent', muscle: 'biceps', tracksFat: false },
  { key: 'thighCm', label: 'Thigh', hint: 'Mid-thigh, halfway to the knee', muscle: 'quads', tracksFat: false },
  { key: 'neckCm', label: 'Neck', hint: 'Just below the larynx', muscle: 'shoulders', tracksFat: false },
];

export interface SitePoint {
  date: string;
  cm: number;
}

/**
 * Every recorded value for one site, oldest first. Logs are stored newest-first
 * and a site can be blank in any given entry, so this both filters and flips.
 */
export function siteSeries(logs: MeasurementLog[], key: MeasurementKey): SitePoint[] {
  return logs
    .filter((m) => typeof m[key] === 'number')
    .map((m) => ({ date: m.date, cm: m[key] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface SiteChange {
  first: SitePoint;
  last: SitePoint;
  deltaCm: number;
}

/** Change from the earliest to the latest reading, or null with fewer than two. */
export function siteChange(logs: MeasurementLog[], key: MeasurementKey): SiteChange | null {
  const series = siteSeries(logs, key);
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  return { first, last, deltaCm: last.cm - first.cm };
}

/**
 * Most recent value per site, which may come from different entries — someone
 * who measured only their waist last week hasn't lost their chest number.
 */
export function latestBySite(logs: MeasurementLog[]): Partial<Record<MeasurementKey, SitePoint>> {
  const out: Partial<Record<MeasurementKey, SitePoint>> = {};
  for (const site of MEASUREMENT_SITES) {
    const series = siteSeries(logs, site.key);
    if (series.length) out[site.key] = series[series.length - 1]!;
  }
  return out;
}

export type ChangeVerdict = 'toward' | 'away' | 'neutral';

/** Below this the tape itself is the variable, not the body. */
const NOISE_CM = 0.2;

/**
 * Whether a change at one site moves toward the user's stated goal.
 *
 * Only the fat-tracking sites flip direction with the goal, and only for goals
 * that actually imply one: a waist that grows during a bulk is a side effect,
 * not a failure, so it stays neutral rather than being marked a regression.
 */
export function changeVerdict(site: MeasurementSite, deltaCm: number, goal: Goal): ChangeVerdict {
  if (Math.abs(deltaCm) < NOISE_CM) return 'neutral';
  const grew = deltaCm > 0;

  if (site.tracksFat) {
    if (goal === 'lose_fat' || goal === 'recomposition') return grew ? 'away' : 'toward';
    return 'neutral';
  }

  // Limb and torso girth: adding is progress under every goal that wants size,
  // and holding it is the win while cutting — so losing it still reads as away.
  if (goal === 'maintain') return 'neutral';
  return grew ? 'toward' : 'away';
}

export interface SiteTarget {
  site: MeasurementSite;
  target: number;
  latest: number | null;
  /** Remaining distance in cm, always positive; null without a reading. */
  remainingCm: number | null;
  /** True once the latest reading is within the noise band of the target. */
  reached: boolean;
  /** Whether the target is above or below where you are now. */
  direction: 'up' | 'down' | 'there';
}

/**
 * Progress toward a measurement goal.
 *
 * No percentage bar here, deliberately. A bar needs a start point, and the
 * honest start — the first reading ever taken — is often from a different body
 * and a different tape technique. The distance remaining is a number that
 * cannot be wrong.
 */
export function siteTargets(
  logs: MeasurementLog[],
  targets: Record<string, number> | undefined,
): SiteTarget[] {
  if (!targets) return [];
  const out: SiteTarget[] = [];
  for (const site of MEASUREMENT_SITES) {
    const target = targets[site.key];
    if (typeof target !== 'number' || target <= 0) continue;
    const latest = latestBySite(logs)[site.key] ?? null;
    const value = latest?.cm ?? null;
    const gap = value == null ? null : Math.round(Math.abs(target - value) * 10) / 10;
    const reached = gap != null && gap <= NOISE_CM;
    out.push({
      site,
      target,
      latest: value,
      remainingCm: gap,
      reached,
      direction: value == null || reached ? 'there' : target > value ? 'up' : 'down',
    });
  }
  return out;
}
