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
  const rawParts: { key: keyof DisciplineWeights; pct: number }[] = [
    {
      key: 'workout',
      // If no workout was planned for today, don't punish — give full credit.
      pct: !input.workoutPlanned ? 1 : input.workoutCompleted ? 1 : 0,
    },
    { key: 'nutrition', pct: nutritionAdherence(input.calories, input.calorieTarget) },
    { key: 'protein', pct: ratio(input.protein, input.proteinTarget) },
    { key: 'steps', pct: ratio(input.steps, input.stepsTarget) },
    { key: 'water', pct: ratio(input.waterOz, input.waterTarget) },
    { key: 'sleep', pct: ratio(input.sleepMinutes, input.sleepTarget) },
  ];

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  let score = 0;
  const parts = rawParts.map((p) => {
    const possible = (weights[p.key] / totalWeight) * 100;
    const earned = possible * p.pct;
    score += earned;
    return { key: p.key, earned: Math.round(earned), possible: Math.round(possible), pct: p.pct };
  });

  return { score: Math.round(clamp(score, 0, 100)), parts };
}
