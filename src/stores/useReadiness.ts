import { useMemo } from 'react';
import { todayISO } from '../domain/date';
import {
  consecutiveTrainingDays,
  loadRatio,
  readiness,
  trailingSleepAverage,
  type Readiness,
} from '../domain/readiness';
import { daysElapsedInWeek, weeklyVolumeSeries } from '../domain/volumeTrend';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useWorkoutStore } from './useWorkoutStore';

/**
 * Today's readiness reading, or null when the app has nothing to read.
 *
 * Assembled from the stores in one place so the home card and the readiness
 * screen cannot disagree about the number — the only thing worse than a
 * readiness score is two of them.
 */
export function useReadiness(): Readiness | null {
  const target = useProfileStore((s) => s.targets.sleepMinutes);
  const sleepLogs = useLogStore((s) => s.sleep);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());

  return useMemo(() => {
    const today = todayISO();
    const lastNight = sleepLogs.find((s) => s.date === today);

    // The most recent completed session, by date; the store's order is an
    // implementation detail and has come back either way after a rehydrate.
    const latest = [...workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];

    const series = weeklyVolumeSeries(workouts, today, 6);

    return readiness({
      sleepMinutes: lastNight && lastNight.minutes > 0 ? lastNight.minutes : null,
      sleepTargetMinutes: target,
      sleepAverageMinutes: trailingSleepAverage(sleepLogs, today),
      lastEffort: latest?.effort ?? null,
      consecutiveDays: workouts.length > 0 ? consecutiveTrainingDays(workouts, today) : null,
      loadRatio: loadRatio(series, daysElapsedInWeek(today)),
    });
  }, [sleepLogs, workouts, target]);
}
