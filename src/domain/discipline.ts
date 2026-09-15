import { clamp } from './units';
import type { DisciplineWeights } from './types';

export const DEFAULT_DISCIPLINE_WEIGHTS: DisciplineWeights = {
  workout: 25,
  nutrition: 25,
  protein: 20,
  steps: 10,
  water: 10,
  sleep: 10,
};

export interface DisciplineInputs {
  workoutCompleted: boolean;
  workoutPlanned: boolean;
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  steps: number;
  stepsTarget: number;
  waterOz: number;
  waterTarget: number;
  sleepMinutes: number;
  sleepTarget: number;
}

export interface DisciplineBreakdown {
  score: number; // 0-100
  parts: { key: keyof DisciplineWeights; earned: number; possible: number; pct: number }[];
}

/** Ratio capped at 1; a target of 0 (metric not tracked) contributes full credit. */
function ratio(value: number, target: number): number {
  if (target <= 0) return 1;
  return clamp(value / target, 0, 1);
}

/**
 * Nutrition adherence rewards being close to the calorie target (over OR under
 * is penalized symmetrically) rather than simply "more is better". Landing
 * within the target band scores full marks.
 */
function nutritionAdherence(calories: number, target: number): number {
  if (target <= 0) return 1;
  if (calories <= 0) return 0;
  const deviation = Math.abs(calories - target) / target;
  // 0% deviation -> 1.0, 25%+ deviation -> 0.
  return clamp(1 - deviation / 0.25, 0, 1);
}

/**
 * Daily discipline score. Weights are user-customizable and are normalized so
 * the result is always 0-100 even if they don't sum to 100.
 */
export function disciplineScore(
  input: DisciplineInputs,
  weights: DisciplineWeights = DEFAULT_DISCIPLINE_WEIGHTS,
): DisciplineBreakdown {
  // pct === null means the metric does not apply today, so it leaves the score
  // entirely rather than scoring 0 or 100.
  const rawParts: { key: keyof DisciplineWeights; pct: number | null }[] = [
    {
      key: 'workout',
      // On a rest day the workout component is dropped, not awarded. Giving full
      // credit for having planned nothing handed a brand-new user a quarter of
      // the day's score for doing nothing at all, which makes the number
      // meaningless on exactly the day it has to earn trust.
      pct: !input.workoutPlanned ? null : input.workoutCompleted ? 1 : 0,
    },
    { key: 'nutrition', pct: nutritionAdherence(input.calories, input.calorieTarget) },
    { key: 'protein', pct: ratio(input.protein, input.proteinTarget) },
    { key: 'steps', pct: ratio(input.steps, input.stepsTarget) },
    { key: 'water', pct: ratio(input.waterOz, input.waterTarget) },
    { key: 'sleep', pct: ratio(input.sleepMinutes, input.sleepTarget) },
  ];

  // Only applicable metrics are in the denominator, so dropping one redistributes
  // its weight across the rest instead of shrinking the maximum reachable score.
  const applicable = rawParts.filter((p) => p.pct !== null);
  const totalWeight = applicable.reduce((a, p) => a + weights[p.key], 0) || 1;

  let score = 0;
  const parts = rawParts.map((p) => {
    if (p.pct === null) return { key: p.key, earned: 0, possible: 0, pct: 0 };
    const possible = (weights[p.key] / totalWeight) * 100;
    const earned = possible * p.pct;
    score += earned;
    return { key: p.key, earned: Math.round(earned), possible: Math.round(possible), pct: p.pct };
  });

  return { score: Math.round(clamp(score, 0, 100)), parts };
}
