import { displayWeight, round } from './units';
import type { Experience, SetEntry, Units, Workout } from './types';

export interface PreviousPerformance {
  weightKg: number;
  reps: number;
  rpe: number | null;
  date: string;
}

export interface OverloadRecommendation {
  weightKg: number;
  reps: number;
  rationale: string;
}

// Smallest weight jump we suggest, by experience. Beginners can add more.
const INCREMENT_KG: Record<Experience, number> = {
  beginner: 2.5,
  intermediate: 1.25,
  advanced: 1.25,
};

/**
 * Find the top working set for an exercise in the most recent workout that
 * contained it. Warmups are ignored.
 */
export function findPreviousPerformance(
  history: Workout[],
  exerciseId: string,
): PreviousPerformance | null {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const w of sorted) {
    if (w.status !== 'completed') continue;
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    let best: SetEntry | null = null;
    for (const s of ex.sets) {
      if (!s.completed || s.isWarmup || !s.weightKg || !s.reps) continue;
      if (!best || (s.weightKg ?? 0) * (s.reps ?? 0) > (best.weightKg ?? 0) * (best.reps ?? 0)) {
        best = s;
      }
    }
    if (best) {
      return { weightKg: best.weightKg!, reps: best.reps!, rpe: best.rpe, date: w.date };
    }
  }
  return null;
}

/**
 * Double-progression recommendation:
 *  - Hit or exceeded the top of the rep range (or RPE was easy) -> add weight, reset reps.
 *  - Otherwise -> keep weight, aim for one more rep.
 *  - No history -> return null (UI shows a target based on the program).
 */
export function recommendNext(
  prev: PreviousPerformance | null,
  opts: { experience: Experience; repRange?: [number, number]; units?: Units } = { experience: 'intermediate' },
): OverloadRecommendation | null {
  if (!prev) return null;
  const [low, high] = opts.repRange ?? [6, 10];
  const inc = INCREMENT_KG[opts.experience];
  // The rationale is user-facing, so it has to speak the user's units — it read
  // "bump 1.25kg" to someone whose whole app is in pounds.
  const units: Units = opts.units ?? 'metric';
  const show = (kg: number) => {
    const d = displayWeight(kg, units);
    return `${d.value} ${d.unit}`;
  };

  const easy = prev.rpe != null && prev.rpe <= 7;
  const hitTop = prev.reps >= high;

  if (hitTop || easy) {
    return {
      weightKg: round(prev.weightKg + inc, 2),
      reps: low,
      rationale: hitTop
        ? `You hit ${prev.reps} reps last time — add ${show(inc)} and rebuild the range.`
        : `That felt easy (RPE ${prev.rpe}). Bump ${show(inc)}.`,
    };
  }

  return {
    weightKg: prev.weightKg,
    reps: Math.min(high, prev.reps + 1),
    rationale: `Match ${show(prev.weightKg)} and add one rep (${prev.reps} → ${Math.min(high, prev.reps + 1)}).`,
  };
}
