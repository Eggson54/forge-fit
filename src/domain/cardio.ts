import type { ISODate, ISODateTime, Units, UUID } from './types';
import { kmToMiles } from './units';

/**
 * Conditioning work, logged alongside the lifting.
 *
 * Kept separate from the workout model on purpose. A run is not a set of an
 * exercise: it has no reps, no load, and its volume is time and distance. Bolting
 * it onto `Workout` would have put null columns through every strength
 * calculation in the app — the PR check, the progressive overload, the muscle
 * volume landmarks — none of which have anything to say about a 5k.
 */

export type CardioType = 'run' | 'ride' | 'walk' | 'swim' | 'row' | 'hike' | 'elliptical' | 'stairs' | 'other';

export interface CardioSession {
  id: UUID;
  date: ISODate;
  type: CardioType;
  minutes: number;
  /** Optional: machines and classes often have no distance worth recording. */
  distanceKm?: number;
  /** Optional, and never invented — an estimate would read as a measurement. */
  calories?: number;
  /** 1–5, the same scale as session effort on a lift. */
  effort?: number;
  notes?: string;
  source: 'manual' | 'strava' | 'health';
  /**
   * The id this session has in whatever system it was imported from. Held so
   * a second import does not add a second copy of the same run.
   */
  externalId?: string;
  loggedAt: ISODateTime;
}

/** Map an imported activity's free-text type onto a kind the app knows. */
export function cardioTypeFromLabel(label: string): CardioType {
  const t = label.trim().toLowerCase();
  if (t.includes('run') || t.includes('jog')) return 'run';
  if (t.includes('ride') || t.includes('cycl') || t.includes('bike')) return 'ride';
  if (t.includes('swim')) return 'swim';
  if (t.includes('row')) return 'row';
  if (t.includes('hike')) return 'hike';
  if (t.includes('walk')) return 'walk';
  if (t.includes('elliptical')) return 'elliptical';
  if (t.includes('stair')) return 'stairs';
  return 'other';
}

/**
 * How the speed of a thing is normally spoken about.
 *
 * Runners think in minutes per mile; cyclists think in miles per hour. Printing
 * "3:52 /mi" against a bike ride is arithmetically right and reads as nonsense.
 */
export type Cadence = 'pace' | 'speed';

export interface CardioKind {
  type: CardioType;
  label: string;
  /** Whether a distance is the normal thing to record for this. */
  distanceUsual: boolean;
  cadence: Cadence;
  /** Glyph in the app icon set. */
  icon: string;
}

export const CARDIO_KINDS: CardioKind[] = [
  { type: 'run', label: 'Run', distanceUsual: true, cadence: 'pace', icon: 'steps' },
  { type: 'ride', label: 'Ride', distanceUsual: true, cadence: 'speed', icon: 'bolt' },
  { type: 'walk', label: 'Walk', distanceUsual: true, cadence: 'pace', icon: 'steps' },
  { type: 'swim', label: 'Swim', distanceUsual: true, cadence: 'pace', icon: 'water' },
  { type: 'row', label: 'Row', distanceUsual: true, cadence: 'pace', icon: 'dumbbell' },
  { type: 'hike', label: 'Hike', distanceUsual: true, cadence: 'pace', icon: 'map' },
  { type: 'elliptical', label: 'Elliptical', distanceUsual: false, cadence: 'pace', icon: 'repeat' },
  { type: 'stairs', label: 'Stairs', distanceUsual: false, cadence: 'pace', icon: 'chart' },
  { type: 'other', label: 'Other', distanceUsual: false, cadence: 'pace', icon: 'timer' },
];

const KIND_BY_TYPE = new Map(CARDIO_KINDS.map((k) => [k.type, k]));

export function cardioKind(type: CardioType): CardioKind {
  return KIND_BY_TYPE.get(type) ?? CARDIO_KINDS[CARDIO_KINDS.length - 1]!;
}

/**
 * Minutes per unit of distance.
 *
 * Returns null rather than Infinity when there is no distance: a gym class has
 * no pace, and "∞ /mi" on a screen is worse than an empty cell.
 */
export function paceMinutesPer(session: CardioSession, units: Units): number | null {
  if (!session.distanceKm || session.distanceKm <= 0) return null;
  if (!Number.isFinite(session.minutes) || session.minutes <= 0) return null;
  const distance = units === 'imperial' ? kmToMiles(session.distanceKm) : session.distanceKm;
  if (distance <= 0) return null;
  return session.minutes / distance;
}

/** "7:42 /mi". Seconds are floored to avoid a pace of 7:60. */
export function formatPace(minutesPer: number | null, units: Units): string | null {
  if (minutesPer == null || !Number.isFinite(minutesPer) || minutesPer <= 0) return null;
  const totalSeconds = Math.round(minutesPer * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')} /${units === 'imperial' ? 'mi' : 'km'}`;
}

/** Distance covered per hour, in the user's units. Null without a distance. */
export function speedPerHour(session: CardioSession, units: Units): number | null {
  if (!session.distanceKm || session.distanceKm <= 0) return null;
  if (!Number.isFinite(session.minutes) || session.minutes <= 0) return null;
  const distance = units === 'imperial' ? kmToMiles(session.distanceKm) : session.distanceKm;
  return (distance / session.minutes) * 60;
}

export function formatSpeed(perHour: number | null, units: Units): string | null {
  if (perHour == null || !Number.isFinite(perHour) || perHour <= 0) return null;
  return `${Math.round(perHour * 10) / 10} ${units === 'imperial' ? 'mph' : 'km/h'}`;
}

/**
 * Whichever of pace or speed this kind of session is normally spoken about in.
 * Null when there is no distance, so the row simply leaves it out.
 */
export function formatCadence(session: CardioSession, units: Units): string | null {
  return cardioKind(session.type).cadence === 'speed'
    ? formatSpeed(speedPerHour(session, units), units)
    : formatPace(paceMinutesPer(session, units), units);
}

/** Distance in the user's units, rounded for display. Null when unrecorded. */
export function displayDistance(km: number | undefined, units: Units): { value: number; unit: string } | null {
  if (!km || km <= 0) return null;
  const value = units === 'imperial' ? kmToMiles(km) : km;
  return { value: Math.round(value * 100) / 100, unit: units === 'imperial' ? 'mi' : 'km' };
}

export interface CardioTotals {
  sessions: number;
  minutes: number;
  distanceKm: number;
  /** Only the sessions that recorded one; never estimated for the rest. */
  calories: number;
  /** How many sessions contributed a calorie figure, so the UI can hedge. */
  sessionsWithCalories: number;
}

export function totalCardio(sessions: CardioSession[]): CardioTotals {
  return sessions.reduce<CardioTotals>(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      minutes: acc.minutes + (Number.isFinite(s.minutes) ? s.minutes : 0),
      distanceKm: acc.distanceKm + (s.distanceKm ?? 0),
      calories: acc.calories + (s.calories ?? 0),
      sessionsWithCalories: acc.sessionsWithCalories + (s.calories ? 1 : 0),
    }),
    { sessions: 0, minutes: 0, distanceKm: 0, calories: 0, sessionsWithCalories: 0 },
  );
}

/** Sessions on the given dates, newest first. */
export function cardioInWeek(sessions: CardioSession[], weekDates: string[]): CardioSession[] {
  const week = new Set(weekDates);
  return sessions.filter((s) => week.has(s.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Minutes of conditioning per week over a run of weeks, oldest first.
 *
 * Used for the trend strip. Weeks with nothing logged stay in the series as
 * zeroes, because a gap in conditioning is the thing the chart is for.
 */
export function weeklyCardioMinutes(sessions: CardioSession[], weeks: string[][]): number[] {
  return weeks.map((dates) => totalCardio(cardioInWeek(sessions, dates)).minutes);
}

/**
 * The public-health floor most guidance converges on: 150 minutes a week of
 * moderate activity. Stated as a reference point, not a target the app sets —
 * plenty of people training hard four days a week will sit under it and be fine.
 */
export const WEEKLY_MINUTES_REFERENCE = 150;

export interface CardioReading {
  minutes: number;
  /** 0–1 against the reference, clamped. */
  ratio: number;
  headline: string;
  detail: string;
}

export function readCardioWeek(minutes: number, sessions: number): CardioReading {
  const ratio = Math.min(1, minutes / WEEKLY_MINUTES_REFERENCE);

  if (sessions === 0) {
    return {
      minutes,
      ratio: 0,
      headline: 'No conditioning this week',
      detail: 'Lifting is not cardio. Even a couple of easy sessions moves the needle on the things a barbell does not.',
    };
  }
  if (minutes >= WEEKLY_MINUTES_REFERENCE) {
    return {
      minutes,
      ratio,
      headline: `${Math.round(minutes)} minutes across ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`,
      detail: `Past the ${WEEKLY_MINUTES_REFERENCE}-minute reference most guidance uses.`,
    };
  }
  return {
    minutes,
    ratio,
    headline: `${Math.round(minutes)} minutes across ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`,
    detail: `${Math.round(WEEKLY_MINUTES_REFERENCE - minutes)} short of the ${WEEKLY_MINUTES_REFERENCE}-minute reference — a number to know, not a rule to obey.`,
  };
}
