import { KM, MILE, cleanTrack, type TrackPoint } from './track';
import { distanceMeters } from './geo';
import type { ISODate, UUID } from './types';

/**
 * The fastest you covered a given distance — inside a single activity, and
 * across all of them.
 *
 * The distances are the ones people actually race, plus the two that are only
 * ever training markers. The method is a sliding window over the trace rather
 * than a lookup of split times: the fastest kilometre of a run very rarely
 * starts on a kilometre boundary, and reporting the best *split* as the best
 * kilometre understates almost everybody.
 */

export interface EffortDistance {
  key: string;
  label: string;
  meters: number;
  /** Shown on the imperial board, the metric board, or both. */
  units: 'imperial' | 'metric' | 'both';
}

export const EFFORT_DISTANCES: EffortDistance[] = [
  { key: '400m', label: '400 m', meters: 400, units: 'metric' },
  { key: 'halfmile', label: '½ mile', meters: MILE / 2, units: 'imperial' },
  { key: '1k', label: '1 km', meters: KM, units: 'metric' },
  { key: '1mi', label: '1 mile', meters: MILE, units: 'both' },
  { key: '5k', label: '5 km', meters: 5 * KM, units: 'both' },
  { key: '10k', label: '10 km', meters: 10 * KM, units: 'both' },
  { key: '15k', label: '15 km', meters: 15 * KM, units: 'metric' },
  { key: '10mi', label: '10 miles', meters: 10 * MILE, units: 'imperial' },
  { key: 'half', label: 'Half marathon', meters: 21_097.5, units: 'both' },
  { key: 'marathon', label: 'Marathon', meters: 42_195, units: 'both' },
];

export function effortDistancesFor(units: 'imperial' | 'metric'): EffortDistance[] {
  return EFFORT_DISTANCES.filter((d) => d.units === 'both' || d.units === units);
}

export interface BestEffort {
  key: string;
  label: string
  meters: number;
  seconds: number;
  /** Index into the cleaned trace where the window starts. */
  startIndex: number;
  endIndex: number;
}

/**
 * The fastest window of each distance within one trace.
 *
 * Two pointers over a cumulative-distance array, so it is linear in the number
 * of points rather than quadratic — an hour of one-second samples is three
 * thousand points and ten distances, and the naive version of this is the
 * reason activity screens hang.
 *
 * Window ends are interpolated. Snapping to the nearest fix quantises a 5k
 * time to whatever three or four metres of travel happens to cost, which on a
 * fast run is a couple of seconds of pure artefact.
 */
export function bestEffortsIn(points: TrackPoint[], distances = EFFORT_DISTANCES): BestEffort[] {
  const pts = cleanTrack(points);
  if (pts.length < 2) return [];

  // cum[i] is the distance from the start to point i.
  const cum: number[] = new Array(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1]! + distanceMeters(pts[i - 1]!, pts[i]!);
  }
  const total = cum[cum.length - 1]!;

  const out: BestEffort[] = [];

  for (const d of distances) {
    if (total < d.meters) continue;

    let best = Infinity;
    let bestStart = 0;
    let bestEnd = 0;
    let end = 1;

    for (let start = 0; start < pts.length - 1; start++) {
      while (end < pts.length && cum[end]! - cum[start]! < d.meters) end += 1;
      if (end >= pts.length) break;

      // Interpolate back along the final leg to the exact distance mark.
      const legLength = cum[end]! - cum[end - 1]!;
      const overshoot = cum[end]! - cum[start]! - d.meters;
      const fraction = legLength > 0 ? overshoot / legLength : 0;
      const endT = pts[end]!.t - (pts[end]!.t - pts[end - 1]!.t) * fraction;
      const seconds = (endT - pts[start]!.t) / 1000;

      if (seconds > 0 && seconds < best) {
        best = seconds;
        bestStart = start;
        bestEnd = end;
      }
    }

    if (Number.isFinite(best)) {
      out.push({ key: d.key, label: d.label, meters: d.meters, seconds: best, startIndex: bestStart, endIndex: bestEnd });
    }
  }

  return out;
}

export interface EffortRecord extends BestEffort {
  activityId: UUID;
  activityName: string;
  date: ISODate;
}

/**
 * The all-time board: one row per distance, the best you have ever done it.
 *
 * Ties go to the earlier date. A record you set in March and matched in
 * October is still March's — matching a personal best is not beating it, and
 * quietly re-dating it erases the day it happened.
 */
export function allTimeBests(
  activities: { id: UUID; name: string; date: ISODate; efforts: BestEffort[] }[],
): EffortRecord[] {
  const bestByKey = new Map<string, EffortRecord>();

  for (const a of activities) {
    for (const e of a.efforts) {
      const held = bestByKey.get(e.key);
      const better =
        !held || e.seconds < held.seconds || (e.seconds === held.seconds && a.date < held.date);
      if (better) {
        bestByKey.set(e.key, { ...e, activityId: a.id, activityName: a.name, date: a.date });
      }
    }
  }

  return EFFORT_DISTANCES.map((d) => bestByKey.get(d.key)).filter((r): r is EffortRecord => !!r);
}

/** Every effort at one distance, fastest first — the distance's own history. */
export function historyFor(
  key: string,
  activities: { id: UUID; name: string; date: ISODate; efforts: BestEffort[] }[],
): EffortRecord[] {
  return activities
    .flatMap((a) =>
      a.efforts
        .filter((e) => e.key === key)
        .map((e) => ({ ...e, activityId: a.id, activityName: a.name, date: a.date })),
    )
    .sort((x, y) => x.seconds - y.seconds);
}

/**
 * Where a new effort lands against what came before.
 *
 * Returns null when the distance has no history: "1st of 1" is not an
 * achievement, and a medal for it devalues the ones that are.
 */
export interface EffortStanding {
  rank: number;
  outOf: number;
  /** Seconds off the best. Zero when this *is* the best. */
  behindBest: number;
  isBest: boolean;
}

export function standingOf(effort: BestEffort, history: EffortRecord[]): EffortStanding | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.seconds - b.seconds);
  const rank = sorted.filter((h) => h.seconds < effort.seconds).length + 1;
  const best = sorted[0]!.seconds;
  return {
    rank,
    outOf: sorted.length,
    behindBest: Math.max(0, effort.seconds - best),
    isBest: rank === 1,
  };
}

export const BEST_EFFORTS_NOTE =
  'These are the fastest stretches inside your activities, not laps you started a stopwatch for. The fastest kilometre of a run almost never begins on a kilometre marker, so this looks for the quickest window anywhere in the trace.';
