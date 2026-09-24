import type { ISODate } from './types';

/**
 * Workouts that other devices wrote into Apple Health.
 *
 * This is how a Garmin, a WHOOP, a Polar or a Strava import reaches ForgeFit
 * on iOS without a single vendor integration: their own app writes the
 * workout to HealthKit, and this reads it back. No OAuth, no client secret,
 * no API to keep up with, and nothing leaves the phone.
 *
 * Three problems have to be solved for that to be usable, and all three are
 * here rather than in the service because all three are easy to get subtly
 * wrong and invisible when you do:
 *
 *  1. **The same run can arrive twice.** Somebody with Garmin Connect *and*
 *     Strava both syncing to Health gets two records of one run, minutes
 *     apart in start time and slightly different in duration. Importing both
 *     doubles their training load, their weekly distance and their calories.
 *  2. **"Which device recorded this" is not a guessable thing.** Reading it
 *     off which metrics are present is how you conclude somebody owns an
 *     Apple Watch because their Garmin reported a resting heart rate.
 *     `sourceRevision.source` says who wrote it, so that is what gets used.
 *  3. **HealthKit's activity types do not map one-to-one onto this app's.**
 *     Sixty-odd HKWorkoutActivityType values collapse into nine CardioTypes,
 *     and the ones with no sensible home need to land somewhere honest
 *     rather than being silently called a run.
 */

// ------------------------------------------------- their shape, trimmed ----

export interface HkSource {
  name?: string;
  bundleIdentifier?: string;
}

export interface HkQuantity {
  quantity?: number;
  unit?: string;
}

/** Only the fields this app reads from `HKWorkoutRaw`. */
export interface HkWorkout {
  uuid?: string;
  workoutActivityType?: number;
  /** Seconds. */
  duration?: number;
  totalDistance?: HkQuantity;
  totalEnergyBurned?: HkQuantity;
  /**
   * The library's raw layer hands these back as ISO strings and its JS
   * wrapper converts them to `Date`. Both are accepted rather than one
   * assumed, because which you get depends on which entry point the caller
   * used and the mistake is invisible until a device reports it.
   */
  startDate?: string | Date;
  endDate?: string | Date;
  sourceRevision?: { source?: HkSource; productType?: string };
}

// ------------------------------------------------------ activity types -----

/**
 * HealthKit activity type numbers, named.
 *
 * Only the ones that map onto something this app tracks. The numbers are the
 * stable part of the API — the enum names have changed spelling across
 * versions, the integers have not.
 */
export const HK_ACTIVITY: Record<number, string> = {
  13: 'ride', // cycling
  16: 'elliptical',
  20: 'strength', // functionalStrengthTraining
  24: 'hike', // hiking
  35: 'row', // rowing
  37: 'run', // running
  44: 'stairs', // stairClimbing
  46: 'swim', // swimming
  50: 'strength', // traditionalStrengthTraining
  52: 'walk', // walking
  63: 'other', // highIntensityIntervalTraining
  68: 'stairs', // stairs
  74: 'ride', // handCycling
};

/**
 * A CardioType for a HealthKit activity number.
 *
 * Anything unrecognised becomes 'other' rather than being guessed at. A
 * yoga session imported as a run would put a 45-minute "run" with no
 * distance into the athlete's training load, which is worse than an honest
 * "other".
 */
export function cardioTypeFor(activityType: number | undefined): string {
  if (activityType == null) return 'other';
  return HK_ACTIVITY[activityType] ?? 'other';
}

// ------------------------------------------------------------ sources ------

export type WorkoutSource = 'apple_watch' | 'iphone' | 'garmin' | 'whoop' | 'polar' | 'strava' | 'other';

/**
 * Bundle identifiers, checked before names.
 *
 * A bundle id is stable and unique; a display name is localised and can be
 * anything the vendor renames the app to next year.
 */
const BUNDLE_SOURCES: { match: RegExp; source: WorkoutSource }[] = [
  { match: /^com\.apple\.health/i, source: 'apple_watch' },
  { match: /^com\.garmin\./i, source: 'garmin' },
  { match: /^com\.whoop\./i, source: 'whoop' },
  { match: /^com\.polar\./i, source: 'polar' },
  { match: /^com\.strava\./i, source: 'strava' },
];

const NAME_SOURCES: { match: RegExp; source: WorkoutSource }[] = [
  { match: /garmin/i, source: 'garmin' },
  { match: /whoop/i, source: 'whoop' },
  { match: /polar/i, source: 'polar' },
  { match: /strava/i, source: 'strava' },
  { match: /apple\s*watch/i, source: 'apple_watch' },
  { match: /iphone/i, source: 'iphone' },
];

export const SOURCE_LABEL: Record<WorkoutSource, string> = {
  apple_watch: 'Apple Watch',
  iphone: 'iPhone',
  garmin: 'Garmin',
  whoop: 'WHOOP',
  polar: 'Polar',
  strava: 'Strava',
  other: 'Another app',
};

/**
 * Which device or app recorded a workout.
 *
 * `productType` is the most precise signal when it is there — an Apple Watch
 * reports something like "Watch6,1" — and it is the only one that
 * distinguishes a Watch recording from the Health app relaying somebody
 * else's data, because both carry an Apple bundle identifier.
 */
export function sourceOf(workout: HkWorkout): WorkoutSource {
  const product = workout.sourceRevision?.productType ?? '';
  if (/^Watch/i.test(product)) return 'apple_watch';
  if (/^iPhone/i.test(product)) return 'iphone';

  const bundle = workout.sourceRevision?.source?.bundleIdentifier ?? '';
  for (const { match, source } of BUNDLE_SOURCES) {
    if (match.test(bundle)) return source;
  }

  const name = workout.sourceRevision?.source?.name ?? '';
  for (const { match, source } of NAME_SOURCES) {
    if (match.test(name)) return source;
  }

  return 'other';
}

// ------------------------------------------------------------ results ------

export interface ImportedWorkout {
  /** HealthKit's own UUID, so a re-import replaces rather than duplicates. */
  uuid: string;
  date: ISODate;
  startedAt: string;
  endedAt: string;
  type: string;
  /** Seconds. */
  durationS: number;
  distanceM: number | null;
  energyKcal: number | null;
  source: WorkoutSource;
  sourceName: string;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isoOf(value: string | Date | undefined): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** The local calendar date a workout belongs to, from its start. */
function dateOf(iso: string): ISODate | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // Local rather than UTC: a 9pm run in UTC-5 is that day's run, not
  // tomorrow's, and the rest of the app keys its days locally.
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Turn one HealthKit workout into something importable, or null.
 *
 * Distance and energy come back as `{quantity, unit}` and are requested in
 * metres and kilocalories; the unit is checked anyway rather than trusted,
 * because a silent kilometre-for-metre mix-up turns a 10 km run into 10 m.
 */
export function readWorkout(workout: HkWorkout): ImportedWorkout | null {
  const uuid = workout.uuid?.trim();
  const startedAt = isoOf(workout.startDate);
  const endedAt = isoOf(workout.endDate);
  if (!uuid || !startedAt || !endedAt) return null;

  const date = dateOf(startedAt);
  if (!date) return null;

  const durationS = num(workout.duration);
  // A workout with no duration is a corrupt record, not a zero-second one.
  if (durationS == null || durationS <= 0) return null;

  const distanceUnit = (workout.totalDistance?.unit ?? 'm').toLowerCase();
  const rawDistance = num(workout.totalDistance?.quantity);
  const distanceM =
    rawDistance == null ? null : distanceUnit === 'km' ? rawDistance * 1000 : rawDistance;

  const energyUnit = (workout.totalEnergyBurned?.unit ?? 'kcal').toLowerCase();
  const rawEnergy = num(workout.totalEnergyBurned?.quantity);
  const energyKcal =
    rawEnergy == null ? null : energyUnit === 'kj' ? Math.round(rawEnergy / 4.184) : Math.round(rawEnergy);

  return {
    uuid,
    date,
    startedAt,
    endedAt,
    type: cardioTypeFor(workout.workoutActivityType),
    durationS: Math.round(durationS),
    distanceM: distanceM == null ? null : Math.round(distanceM),
    energyKcal,
    source: sourceOf(workout),
    sourceName: workout.sourceRevision?.source?.name?.trim() || SOURCE_LABEL[sourceOf(workout)],
  };
}

// ------------------------------------------------------------- dedupe ------

/**
 * How much two records of the same session can differ and still be the same
 * session, in seconds.
 *
 * Generous on purpose. A Garmin timestamps from when the watch got a GPS fix;
 * Strava's copy of the same activity can start a minute or two later after
 * its own processing. Too tight and the duplicate survives; too loose and two
 * genuine back-to-back intervals merge into one.
 */
export const DUPLICATE_WINDOW_S = 300;

/** Preferred first when the same session arrives from several apps. */
const SOURCE_RANK: Record<WorkoutSource, number> = {
  garmin: 0,
  apple_watch: 1,
  whoop: 2,
  polar: 3,
  iphone: 4,
  strava: 5,
  other: 6,
};

function overlaps(a: ImportedWorkout, b: ImportedWorkout): boolean {
  const aStart = new Date(a.startedAt).getTime();
  const bStart = new Date(b.startedAt).getTime();
  if (Number.isNaN(aStart) || Number.isNaN(bStart)) return false;
  if (a.type !== b.type) return false;
  return Math.abs(aStart - bStart) <= DUPLICATE_WINDOW_S * 1000;
}

/**
 * Collapse the same session recorded by several apps down to one.
 *
 * Strava is ranked last deliberately: it is usually a *copy* of what the
 * watch recorded rather than an independent measurement, so when both are
 * present the watch's record is the original and Strava's is the echo.
 *
 * Ties break on the longer duration, on the grounds that the record which
 * captured more of the session is the more complete one.
 */
export function dedupe(workouts: ImportedWorkout[]): ImportedWorkout[] {
  const kept: ImportedWorkout[] = [];

  const ordered = [...workouts].sort((a, b) => {
    const rank = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (rank !== 0) return rank;
    if (b.durationS !== a.durationS) return b.durationS - a.durationS;
    return a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0;
  });

  for (const workout of ordered) {
    if (kept.some((k) => overlaps(k, workout))) continue;
    kept.push(workout);
  }

  // Back into time order for display; the ranking above was only for
  // deciding which copy to keep.
  return kept.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

// ------------------------------------------------------------ summary ------

export interface ImportSummary {
  total: number;
  bySource: { source: WorkoutSource; label: string; count: number }[];
  duplicatesDropped: number;
}

export function summarise(raw: ImportedWorkout[], kept: ImportedWorkout[]): ImportSummary {
  const counts = new Map<WorkoutSource, number>();
  for (const w of kept) counts.set(w.source, (counts.get(w.source) ?? 0) + 1);

  return {
    total: kept.length,
    bySource: [...counts.entries()]
      .map(([source, count]) => ({ source, label: SOURCE_LABEL[source], count }))
      .sort((a, b) => b.count - a.count),
    duplicatesDropped: raw.length - kept.length,
  };
}

export const HEALTH_WORKOUTS_NOTE =
  'Anything that writes to Apple Health shows up here — Garmin, WHOOP, Polar, Strava, the Watch. No account or API key for any of them, because their own app has already done the sync and this only reads what landed. Routes are not included: Health stores a workout’s route separately and most apps do not write it.';
