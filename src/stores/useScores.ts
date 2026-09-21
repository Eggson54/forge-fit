import { useMemo } from 'react';
import { todayISO } from '../domain/date';
import { maintenanceCalories } from '../domain/nutrition';
import {
  baselineStrain,
  cardioLoad,
  dayStillRunning,
  energyBank,
  nutritionScore,
  recentNights,
  sleepScore,
  strainFor,
  targetStrain,
  type CardioLoad,
  type EnergyBank,
  type Score,
  type Strain,
} from '../domain/scores';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useVitalsStore } from './useVitalsStore';
import { useWorkoutStore } from './useWorkoutStore';
import { useReadiness } from './useReadiness';

export interface TodayScores {
  sleep: Score | null;
  nutrition: Score | null;
  strain: Strain;
  strainBaseline: number | null;
  strainTarget: { low: number; high: number } | null;
  cardio: CardioLoad | null;
  energy: EnergyBank | null;
  recovery: number | null;
}

/**
 * Every score for today, from one place.
 *
 * Assembled here for the same reason the achievement inputs are: a number
 * shown on the home card and the same number on its own screen must be the
 * same number, and two call sites building it by hand is how they stop being.
 */
export function useScores(): TodayScores {
  const today = todayISO();
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const sleepLogs = useLogStore((s) => s.sleep);
  const cardioSessions = useLogStore((s) => s.cardio);
  const macros = useLogStore((s) => s.macrosForDate(today));
  const waterOz = useLogStore((s) => s.waterForDate(today));
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const vitalsToday = useVitalsStore((s) => s.days.find((d) => d.date === today) ?? null);
  const readiness = useReadiness();

  return useMemo(() => {
    const lastNight = sleepLogs.find((l) => l.date === today);
    const strain = strainFor({ workouts, cardio: cardioSessions, date: today });
    const base = baselineStrain(workouts, cardioSessions, today);

    return {
      sleep: sleepScore({
        minutes: lastNight?.minutes ?? null,
        targetMinutes: targets.sleepMinutes,
        quality: lastNight?.quality ?? null,
        recentMinutes: recentNights(sleepLogs, today),
      }),
      nutrition: nutritionScore({
        calories: macros.calories,
        proteinG: macros.proteinG,
        fiberG: macros.fiberG ?? null,
        waterOz,
        targets,
        dayInProgress: dayStillRunning(today, today),
      }),
      strain,
      strainBaseline: base,
      strainTarget: targetStrain(readiness?.score ?? null, base),
      cardio: cardioLoad(cardioSessions, today),
      energy: energyBank({
        consumedKcal: macros.calories,
        maintenanceKcal: maintenanceCalories(profile),
        activeKcal: vitalsToday?.activeEnergyKcal ?? null,
        targetKcal: targets.calories,
      }),
      recovery: readiness?.score ?? null,
    };
  }, [today, profile, targets, sleepLogs, cardioSessions, macros, waterOz, workouts, vitalsToday, readiness]);
}
