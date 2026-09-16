import { round } from './units';
import { isWarmupSet } from './sets';
import { effectiveLoadKg, setVolumeKg, trackingFor } from './tracking';
import { exerciseById } from '../data/exercises';
import type { ExerciseTracking, MuscleGroup, SetEntry, Workout, WorkoutExercise } from './types';

/** Estimated one-rep max (Epley formula). Reps of 1 returns the weight. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return round(weightKg * (1 + reps / 30), 1);
}

/**
 * Volume (kg) for a single set. Warmups excluded by caller.
 *
 * `bodyweightKg` lets a bodyweight movement count the athlete's own mass; pass
 * null and it falls back to whatever was entered, which is the old behaviour
 * for a loaded lift and zero for an unweighted pull-up.
 */
export function setVolume(set: SetEntry, tracking: ExerciseTracking = 'load', bodyweightKg: number | null = null): number {
  if (!set.completed || isWarmupSet(set)) return 0;
  return setVolumeKg(set, tracking, bodyweightKg);
}

export function exerciseVolume(ex: WorkoutExercise, bodyweightKg: number | null = null): number {
  const tracking = trackingFor(exerciseById(ex.exerciseId));
  return ex.sets.reduce((sum, s) => sum + setVolume(s, tracking, bodyweightKg), 0);
}

export interface WorkoutStats {
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  /** Seconds held, for duration-tracked work. */
  totalSeconds: number;
  bestE1RM: number;
  muscleVolume: Partial<Record<MuscleGroup, number>>;
}

/** Aggregate stats for a completed (or in-progress) workout. */
export function workoutStats(w: Workout, bodyweightKg: number | null = null): WorkoutStats {
  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  let totalSeconds = 0;
  let bestE1RM = 0;
  const muscleVolume: Partial<Record<MuscleGroup, number>> = {};

  for (const ex of w.exercises) {
    const tracking = trackingFor(exerciseById(ex.exerciseId));
    let exVol = 0;
    for (const s of ex.sets) {
      if (!s.completed || isWarmupSet(s)) continue;
      const v = setVolume(s, tracking, bodyweightKg);
      exVol += v;
      totalVolumeKg += v;
      totalSets += 1;
      totalReps += tracking === 'duration' ? 0 : (s.reps ?? 0);
      totalSeconds += tracking === 'duration' ? (s.seconds ?? 0) : 0;
      const load = effectiveLoadKg(s, tracking, bodyweightKg);
      // A hold has no rep count, so no 1RM can be estimated from it.
      if (tracking !== 'duration' && load > 0 && s.reps) {
        bestE1RM = Math.max(bestE1RM, epley1RM(load, s.reps));
      }
    }
    muscleVolume[ex.primaryMuscle] = round((muscleVolume[ex.primaryMuscle] ?? 0) + exVol);
  }

  return {
    totalVolumeKg: round(totalVolumeKg),
    totalSets,
    totalReps,
    totalSeconds,
    bestE1RM: round(bestE1RM, 1),
    muscleVolume,
  };
}

/** Best estimated 1RM across a set of historical workouts for one exercise. */
export function bestE1RMForExercise(workouts: Workout[], exerciseId: string): number {
  let best = 0;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (s.completed && s.weightKg && s.reps) {
          best = Math.max(best, epley1RM(s.weightKg, s.reps));
        }
      }
    }
  }
  return round(best, 1);
}

/**
 * Average change in estimated 1RM, per lift, between the earlier and later half
 * of the history.
 *
 * Only lifts trained in both halves count. Taking the best e1RM of each
 * *session* instead compares a deadlift day against an arm day, so the number
 * swings with which muscle group came up in the rotation rather than with
 * whether the athlete got stronger.
 *
 * Returns null when nothing was trained on both sides of the split, which is
 * not the same as no change and should not be shown as 0%.
 */
export function strengthChangePct(workouts: Workout[]): number | null {
  const completed = [...workouts]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (completed.length < 2) return null;

  const mid = Math.floor(completed.length / 2);
  const bestByExercise = (window: Workout[]) => {
    const best = new Map<string, number>();
    for (const w of window) {
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!s.completed || isWarmupSet(s) || !s.weightKg || !s.reps) continue;
          const e1rm = epley1RM(s.weightKg, s.reps);
          if (e1rm > (best.get(ex.exerciseId) ?? 0)) best.set(ex.exerciseId, e1rm);
        }
      }
    }
    return best;
  };

  const early = bestByExercise(completed.slice(0, mid));
  const late = bestByExercise(completed.slice(mid));

  const changes: number[] = [];
  for (const [id, before] of early) {
    const after = late.get(id);
    if (after == null || before <= 0) continue;
    changes.push(((after - before) / before) * 100);
  }
  if (changes.length === 0) return null;
  return round(changes.reduce((a, b) => a + b, 0) / changes.length, 1);
}

/**
 * Brzycki one-rep max. It reads lower than Epley in the middle of the rep
 * range and is the more conservative of the two past about five reps, which is
 * why both are shown rather than one being presented as the answer.
 *
 * The formula diverges above 36 reps, so it is only defined below that.
 */
export function brzycki1RM(weightKg: number, reps: number): number | null {
  if (reps <= 0 || weightKg <= 0 || reps >= 36) return null;
  if (reps === 1) return weightKg;
  return round(weightKg * (36 / (37 - reps)), 1);
}

/** Weight you could expect to move for `reps`, inverting Epley. */
export function weightForReps(oneRepMaxKg: number, reps: number): number {
  if (oneRepMaxKg <= 0 || reps <= 0) return 0;
  return round(oneRepMaxKg / (1 + reps / 30), 1);
}

/** Percentage of 1RM that Epley implies for a given rep count. */
export function percentOfMax(reps: number): number {
  if (reps <= 0) return 0;
  return Math.round((1 / (1 + reps / 30)) * 1000) / 10;
}
