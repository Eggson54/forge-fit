import { displayWeight, round, toKg } from './units';
import { isWarmupSet } from './sets';
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

/**
 * Smallest weight jump we suggest, by experience and by the units the athlete
 * actually thinks in. Beginners can add more.
 *
 * These are unit-native rather than converted: the increment has to land on a
 * pair of plates that exists in the gym, and 1.25 kg converted into pounds
 * reads as "add 2.8 lb", which is not a thing anyone can load.
 */
const INCREMENT: Record<Units, Record<Experience, number>> = {
  metric: { beginner: 2.5, intermediate: 1.25, advanced: 1.25 },
  imperial: { beginner: 5, intermediate: 2.5, advanced: 2.5 },
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
      if (!s.completed || isWarmupSet(s) || !s.weightKg || !s.reps) continue;
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
  // The rationale is user-facing, so it has to speak the user's units — it read
  // "bump 1.25kg" to someone whose whole app is in pounds.
  const units: Units = opts.units ?? 'metric';
  const step = INCREMENT[units][opts.experience];
  const show = (value: number) => `${round(value, 2)} ${units === 'imperial' ? 'lb' : 'kg'}`;

  /**
   * Add the step in the units the athlete reads, then convert back. Adding a
   * converted increment to the kg value instead lands a pound or two off a
   * loadable number once both ends are rounded for display.
   */
  const stepUp = (kg: number) => round(toKg(displayWeight(kg, units).value + step, units), 4);

  const easy = prev.rpe != null && prev.rpe <= 7;
  const hitTop = prev.reps >= high;

  if (hitTop || easy) {
    return {
      weightKg: stepUp(prev.weightKg),
      reps: low,
      rationale: hitTop
        ? `You hit ${prev.reps} reps last time — add ${show(step)} and rebuild the range.`
        : `That felt easy (RPE ${prev.rpe}). Bump ${show(step)}.`,
    };
  }

  return {
    weightKg: prev.weightKg,
    reps: Math.min(high, prev.reps + 1),
    rationale: `Match ${show(displayWeight(prev.weightKg, units).value)} and add one rep (${prev.reps} → ${Math.min(high, prev.reps + 1)}).`,
  };
}
