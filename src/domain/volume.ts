import type { MuscleGroup, Workout } from './types';
import { isWarmupSet } from './sets';

/**
 * Weekly training volume measured in *working sets per muscle* — the standard
 * hypertrophy dosage metric. Primary muscle counts as a full set; secondary
 * muscles count as a half set (an original, simple attribution model).
 */

// Approximate weekly set landmarks (min effective / max adaptive) per muscle.
// General guidance, not medical advice; users can train outside these.
export const VOLUME_LANDMARKS: Partial<Record<MuscleGroup, { min: number; max: number }>> = {
  chest: { min: 10, max: 22 },
  back: { min: 10, max: 25 },
  shoulders: { min: 8, max: 22 },
  biceps: { min: 8, max: 20 },
  triceps: { min: 8, max: 20 },
  quads: { min: 8, max: 20 },
  hamstrings: { min: 6, max: 18 },
  glutes: { min: 6, max: 16 },
  calves: { min: 8, max: 20 },
  core: { min: 6, max: 20 },
  forearms: { min: 4, max: 14 },
};

export type MuscleVolume = Partial<Record<MuscleGroup, number>>;

/** Count working sets per muscle across the given workouts (already date-filtered). */
export function weeklySetsPerMuscle(workouts: Workout[]): MuscleVolume {
  const out: MuscleVolume = {};
  const add = (m: MuscleGroup, n: number) => {
    out[m] = Math.round(((out[m] ?? 0) + n) * 10) / 10;
  };
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const workingSets = ex.sets.filter((s) => s.completed && !isWarmupSet(s)).length;
      if (workingSets === 0) continue;
      add(ex.primaryMuscle, workingSets);
      // Secondary muscles get half credit — attribute from the exercise library
      // when available (the caller passes hydrated workouts).
      for (const sec of exerciseSecondary(ex.exerciseId)) add(sec, workingSets * 0.5);
    }
  }
  return out;
}

/** Status of a muscle's weekly volume vs its landmarks. */
export function volumeStatus(muscle: MuscleGroup, sets: number): 'low' | 'optimal' | 'high' | 'none' {
  if (sets <= 0) return 'none';
  const lm = VOLUME_LANDMARKS[muscle];
  if (!lm) return sets > 0 ? 'optimal' : 'none';
  if (sets < lm.min) return 'low';
  if (sets > lm.max) return 'high';
  return 'optimal';
}

// Lazy secondary-muscle lookup that avoids a hard import cycle with the data layer.
let secondaryMap: Record<string, MuscleGroup[]> | null = null;
function exerciseSecondary(exerciseId: string): MuscleGroup[] {
  if (!secondaryMap) {
    secondaryMap = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EXERCISE_LIBRARY } = require('../data/exercises');
      for (const e of EXERCISE_LIBRARY) secondaryMap[e.id] = e.secondaryMuscles;
    } catch {
      secondaryMap = {};
    }
  }
  return secondaryMap[exerciseId] ?? [];
}

/** Muscles ordered by set count, highest first, dropping anything at zero. */
export function topMuscles(volume: MuscleVolume, limit = 6): { muscle: MuscleGroup; sets: number }[] {
  return (Object.entries(volume) as [MuscleGroup, number][])
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([muscle, sets]) => ({ muscle, sets }));
}

/**
 * Share of a session's work each muscle took, as a 0–1 fraction. Used for the
 * split bar on a finished workout: "chest day" is a claim the log can check.
 */
export function muscleShares(volume: MuscleVolume): { muscle: MuscleGroup; sets: number; share: number }[] {
  const rows = topMuscles(volume, 99);
  const total = rows.reduce((a, r) => a + r.sets, 0);
  if (total <= 0) return [];
  return rows.map((r) => ({ ...r, share: r.sets / total }));
}
