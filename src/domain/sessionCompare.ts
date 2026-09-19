import type { Workout } from './types';
import { isWarmupSet } from './sets';
import { epley1RM } from './strength';
import { setVolumeKg } from './tracking';
import type { ExerciseTracking } from './types';

/**
 * How this session compared to the last time you did it.
 *
 * A finished workout tells you what you did. It does not tell you the thing
 * everyone actually wants to know, which is whether it was better than last
 * time — and that comparison is sitting right there in the history.
 */

export type MatchKind = 'same_name' | 'similar' | 'none';

export interface ExerciseDelta {
  exerciseId: string;
  name: string;
  /** Working sets this time and last. */
  sets: number;
  previousSets: number;
  volumeKg: number;
  previousVolumeKg: number;
  /** Best estimated 1RM from a working set, or null when it cannot be computed. */
  topE1RMKg: number | null;
  previousTopE1RMKg: number | null;
  /** Percent change in estimated max; null when either side is missing. */
  strengthChangePct: number | null;
  /** True when this lift was not in the previous session at all. */
  isNew: boolean;
}

export interface SessionComparison {
  match: MatchKind;
  previous: Workout | null;
  /** Present in both sessions, plus anything new, in this session's order. */
  exercises: ExerciseDelta[];
  /** Lifts that were in the previous session and not this one. */
  dropped: { exerciseId: string; name: string }[];
  totalVolumeKg: number;
  previousTotalVolumeKg: number;
  totalSets: number;
  previousTotalSets: number;
  /** How many lifts went up, held, and went down on estimated max. */
  up: number;
  same: number;
  down: number;
}

/** A working set that actually carries a load and a rep count. */
function workingSets(exerciseSets: Workout['exercises'][number]['sets']) {
  return exerciseSets.filter((s) => s.completed && !isWarmupSet(s));
}

/**
 * How each lift is measured, supplied by the caller. This module stays free of
 * the exercise library so it can be tested without it — and so a bodyweight
 * lift is not silently counted as zero volume the way it once was everywhere.
 */
export type TrackingLookup = (exerciseId: string) => ExerciseTracking;

const DEFAULT_LOOKUP: TrackingLookup = () => 'load';

function summarise(workout: Workout, bodyweightKg: number | null, lookup: TrackingLookup) {
  const map = new Map<string, { name: string; sets: number; volumeKg: number; topE1RMKg: number | null }>();
  for (const ex of workout.exercises) {
    const tracking = lookup(ex.exerciseId);
    const done = workingSets(ex.sets);
    if (done.length === 0) continue;
    let volume = 0;
    let top: number | null = null;
    for (const s of done) {
      volume += setVolumeKg(s, tracking, bodyweightKg);
      if (s.weightKg && s.reps) {
        const e = epley1RM(s.weightKg, s.reps);
        if (top == null || e > top) top = e;
      }
    }
    const existing = map.get(ex.exerciseId);
    if (existing) {
      existing.sets += done.length;
      existing.volumeKg += volume;
      if (top != null && (existing.topE1RMKg == null || top > existing.topE1RMKg)) existing.topE1RMKg = top;
    } else {
      map.set(ex.exerciseId, { name: ex.name, sets: done.length, volumeKg: volume, topE1RMKg: top });
    }
  }
  return map;
}

/**
 * The session to compare against.
 *
 * Same name wins, because a named session is the user telling us what it is.
 * Failing that, the most recent session sharing most of its lifts — but only
 * above a real threshold: comparing a push day to a leg day because they both
 * contain one shared movement would be worse than offering no comparison.
 */
export function findPreviousSession(
  workouts: Workout[],
  current: Workout,
  minOverlap = 0.6,
): { workout: Workout; match: MatchKind } | null {
  const currentAt = current.completedAt ?? `${current.date}T23:59:59`;
  const candidates = workouts
    .filter((w) => w.status === 'completed' && w.id !== current.id && (w.completedAt ?? w.date) < currentAt)
    .sort((a, b) => ((a.completedAt ?? a.date) < (b.completedAt ?? b.date) ? 1 : -1));

  const byName = candidates.find((w) => w.name === current.name);
  if (byName) return { workout: byName, match: 'same_name' };

  const currentIds = new Set(current.exercises.map((e) => e.exerciseId));
  if (currentIds.size === 0) return null;

  for (const candidate of candidates) {
    const ids = new Set(candidate.exercises.map((e) => e.exerciseId));
    let shared = 0;
    for (const id of currentIds) if (ids.has(id)) shared += 1;
    const overlap = shared / Math.max(currentIds.size, ids.size);
    if (overlap >= minOverlap) return { workout: candidate, match: 'similar' };
  }
  return null;
}

/** Below this, a change in estimated max is noise from rounding and rep choice. */
export const STRENGTH_NOISE_PCT = 1;

export function compareSessions(
  current: Workout,
  workouts: Workout[],
  bodyweightKg: number | null = null,
  lookup: TrackingLookup = DEFAULT_LOOKUP,
): SessionComparison {
  const found = findPreviousSession(workouts, current);
  const currentMap = summarise(current, bodyweightKg, lookup);
  const previousMap = found ? summarise(found.workout, bodyweightKg, lookup) : new Map();

  const exercises: ExerciseDelta[] = [];
  let up = 0;
  let same = 0;
  let down = 0;

  for (const [exerciseId, now] of currentMap) {
    const before = previousMap.get(exerciseId);
    const pct =
      now.topE1RMKg != null && before?.topE1RMKg != null && before.topE1RMKg > 0
        ? Math.round(((now.topE1RMKg - before.topE1RMKg) / before.topE1RMKg) * 1000) / 10
        : null;

    if (pct != null) {
      if (pct > STRENGTH_NOISE_PCT) up += 1;
      else if (pct < -STRENGTH_NOISE_PCT) down += 1;
      else same += 1;
    }

    exercises.push({
      exerciseId,
      name: now.name,
      sets: now.sets,
      previousSets: before?.sets ?? 0,
      volumeKg: Math.round(now.volumeKg),
      previousVolumeKg: Math.round(before?.volumeKg ?? 0),
      topE1RMKg: now.topE1RMKg,
      previousTopE1RMKg: before?.topE1RMKg ?? null,
      strengthChangePct: pct,
      isNew: !before,
    });
  }

  const dropped: { exerciseId: string; name: string }[] = [];
  for (const [exerciseId, before] of previousMap) {
    if (!currentMap.has(exerciseId)) dropped.push({ exerciseId, name: before.name });
  }

  const total = (m: typeof currentMap) => {
    let volume = 0;
    let sets = 0;
    for (const v of m.values()) {
      volume += v.volumeKg;
      sets += v.sets;
    }
    return { volume: Math.round(volume), sets };
  };
  const nowTotals = total(currentMap);
  const beforeTotals = total(previousMap);

  return {
    match: found?.match ?? 'none',
    previous: found?.workout ?? null,
    exercises,
    dropped,
    totalVolumeKg: nowTotals.volume,
    previousTotalVolumeKg: beforeTotals.volume,
    totalSets: nowTotals.sets,
    previousTotalSets: beforeTotals.sets,
    up,
    same,
    down,
  };
}

/** One line for the top of the comparison, in plain words. */
export function summariseComparison(c: SessionComparison): string {
  if (c.match === 'none') return 'Nothing to compare this against yet.';
  if (c.up === 0 && c.down === 0) return 'Same lifts, much the same numbers.';
  if (c.up > 0 && c.down === 0) return `Up on ${c.up} ${c.up === 1 ? 'lift' : 'lifts'}, down on none.`;
  if (c.down > 0 && c.up === 0) return `Down on ${c.down} ${c.down === 1 ? 'lift' : 'lifts'}.`;
  return `Up on ${c.up}, down on ${c.down}.`;
}
