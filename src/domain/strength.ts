import { round } from './units';
import type { MuscleGroup, SetEntry, Workout, WorkoutExercise } from './types';

/** Estimated one-rep max (Epley formula). Reps of 1 returns the weight. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return round(weightKg * (1 + reps / 30), 1);
}

/** Volume (kg) for a single set: weight * reps. Warmups excluded by caller. */
export function setVolume(set: SetEntry): number {
  if (!set.completed || set.isWarmup) return 0;
  return (set.weightKg ?? 0) * (set.reps ?? 0);
}

export function exerciseVolume(ex: WorkoutExercise): number {
  return ex.sets.reduce((sum, s) => sum + setVolume(s), 0);
}

export interface WorkoutStats {
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  bestE1RM: number;
  muscleVolume: Partial<Record<MuscleGroup, number>>;
}

/** Aggregate stats for a completed (or in-progress) workout. */
export function workoutStats(w: Workout): WorkoutStats {
  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  let bestE1RM = 0;
  const muscleVolume: Partial<Record<MuscleGroup, number>> = {};

  for (const ex of w.exercises) {
    let exVol = 0;
    for (const s of ex.sets) {
      if (!s.completed || s.isWarmup) continue;
      const v = setVolume(s);
      exVol += v;
      totalVolumeKg += v;
      totalSets += 1;
      totalReps += s.reps ?? 0;
      if (s.weightKg && s.reps) {
        bestE1RM = Math.max(bestE1RM, epley1RM(s.weightKg, s.reps));
      }
    }
    muscleVolume[ex.primaryMuscle] = round((muscleVolume[ex.primaryMuscle] ?? 0) + exVol);
  }

  return {
    totalVolumeKg: round(totalVolumeKg),
    totalSets,
    totalReps,
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
