import { todayISO, weekdayIndex } from '../domain/date';
import { disciplineScore, type DisciplineBreakdown } from '../domain/discipline';
import type { CoachContext } from '../domain/coach';
import { timeOfDay } from '../domain/date';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useWorkoutStore } from './useWorkoutStore';
import { useGamificationStore } from './useGamificationStore';

export interface DailySummary {
  date: string;
  calories: number;
  caloriesTarget: number;
  proteinG: number;
  proteinTarget: number;
  carbsG: number;
  fatG: number;
  waterOz: number;
  waterTarget: number;
  steps: number;
  stepsTarget: number;
  sleepMinutes: number;
  sleepTarget: number;
  workoutName: string | null;
  workoutCompleted: boolean;
  workoutPlanned: boolean;
  discipline: DisciplineBreakdown;
  dailyStreak: number;
}

/**
 * Assemble today's dashboard summary. This is the single source of truth the
 * Home screen and coach use, so the numbers are always internally consistent.
 */
export function useDailySummary(date: string = todayISO()): DailySummary {
  const targets = useProfileStore((s) => s.targets);
  const weights = useProfileStore((s) => s.disciplineWeights);

  const macros = useLogStore((s) => s.macrosForDate(date));
  const waterOz = useLogStore((s) => s.waterForDate(date));
  const steps = useLogStore((s) => s.stepsForDate(date));
  const sleepMinutes = useLogStore((s) => s.sleepForDate(date));

  const workouts = useWorkoutStore((s) => s.workouts);
  const dailyStreak = useGamificationStore((s) => s.streaks.daily);

  const todayWorkouts = workouts.filter((w) => w.date === date);
  const completed = todayWorkouts.find((w) => w.status === 'completed');
  const planned = todayWorkouts.find((w) => w.status === 'planned' || w.status === 'in_progress');
  const workoutForToday = completed ?? planned ?? todayWorkouts[0];

  const workoutPlanned = todayWorkouts.length > 0;
  const workoutCompleted = Boolean(completed);

  const discipline = disciplineScore(
    {
      workoutCompleted,
      workoutPlanned,
      calories: macros.calories,
      calorieTarget: targets.calories,
      protein: macros.proteinG,
      proteinTarget: targets.proteinG,
      steps,
      stepsTarget: targets.steps,
      waterOz,
      waterTarget: targets.waterOz,
      sleepMinutes,
      sleepTarget: targets.sleepMinutes,
    },
    weights,
  );

  return {
    date,
    calories: macros.calories,
    caloriesTarget: targets.calories,
    proteinG: macros.proteinG,
    proteinTarget: targets.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    waterOz,
    waterTarget: targets.waterOz,
    steps,
    stepsTarget: targets.steps,
    sleepMinutes,
    sleepTarget: targets.sleepMinutes,
    workoutName: workoutForToday?.name ?? null,
    workoutCompleted,
    workoutPlanned,
    discipline,
    dailyStreak,
  };
}

/** Build the coach's behavioral context from the daily summary + weekly history. */
export function buildCoachContext(summary: DailySummary): CoachContext {
  const workouts = useWorkoutStore.getState().workouts;
  const last7 = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return todayISO(d);
    }),
  );
  const plannedThisWeek = workouts.filter((w) => last7.has(w.date));
  const missed = plannedThisWeek.filter((w) => w.status === 'skipped').length;

  return {
    disciplineScore: summary.discipline.score,
    dailyStreak: summary.dailyStreak,
    workoutPlanned: summary.workoutPlanned,
    workoutCompleted: summary.workoutCompleted,
    proteinRemainingG: Math.max(0, Math.round(summary.proteinTarget - summary.proteinG)),
    waterRemainingOz: Math.max(0, Math.round(summary.waterTarget - summary.waterOz)),
    stepsRemaining: Math.max(0, summary.stepsTarget - summary.steps),
    missedWorkoutsThisWeek: missed,
    timeOfDay: timeOfDay(),
  };
}

export { weekdayIndex };
