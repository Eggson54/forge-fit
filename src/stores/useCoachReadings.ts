import { useMemo } from 'react';
import type { CoachReadingData } from '../domain/coachReadings';
import { energyGap, observedTdee } from '../domain/energyBalance';
import { maintenanceCalories } from '../domain/nutrition';
import { mostOverdue, readRecovery, recoveryBoard } from '../domain/recovery';
import {
  BAND_LABEL,
  bodyFatBand,
  bodyFatChange,
  bodyFatSeries,
  defaultFormula,
} from '../domain/bodyFat';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useWorkoutStore } from './useWorkoutStore';

/**
 * Everything the coach answers by arithmetic rather than by generation.
 *
 * Assembled here, at the one call site that has every store, so the service
 * layer stays a pure function of its request — the same reason
 * `currentAchievementInputs` exists. Two hand-built copies of a bundle like
 * this drift, and the drift is invisible until a number on one screen
 * disagrees with the same number in a sentence.
 */
export function useCoachReadings(): CoachReadingData {
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const nutrition = useLogStore((s) => s.nutrition);
  const weights = useLogStore((s) => s.weight);
  const measurements = useLogStore((s) => s.measurements);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());

  return useMemo(() => {
    const tdee = observedTdee(nutrition, weights);
    const gap = energyGap(nutrition, weights);

    const board = recoveryBoard(workouts);
    const formula = defaultFormula(profile.sex);
    const series = bodyFatSeries(measurements, formula, profile.heightCm);
    const latest = series.length ? series[series.length - 1]! : null;
    const change = bodyFatChange(series);

    return {
      maintenanceKcal: tdee?.kcal ?? null,
      meanIntakeKcal: tdee?.meanIntake ?? null,
      kgPerWeek: tdee?.trend.kgPerWeek ?? null,
      confidence: tdee?.confidence ?? null,
      needsMoreDays: Math.max(0, gap.needDaysLogged - gap.haveDaysLogged),
      needsMoreWeighIns: Math.max(0, gap.needWeighIns - gap.haveWeighIns),

      targetCalories: targets.calories,
      formulaKcal: maintenanceCalories(profile),

      recoveryLine: readRecovery(board),
      readyMuscles: board.filter((r) => r.state === 'ready').slice(0, 3).map((r) => r.label),
      overdueMuscles: mostOverdue(board, 2).map((r) => r.label),

      bodyFatPct: latest?.pct ?? null,
      bodyFatBandLabel: latest ? BAND_LABEL[bodyFatBand(latest.pct, formula)] : null,
      bodyFatDeltaPct: change?.deltaPct ?? null,

      units: profile.units,
    };
  }, [nutrition, weights, measurements, workouts, profile, targets.calories]);
}
