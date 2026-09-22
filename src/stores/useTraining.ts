import { useMemo } from 'react';
import { addDaysISO, todayISO } from '../domain/date';
import { fitnessSeries, loadOf, readFitness, type LoadDay } from '../domain/fitness';
import { allTimeBests, type EffortRecord } from '../domain/bestEfforts';
import { predictRaces, type Prediction } from '../domain/predictions';
import { estimatedMaxHr, zoneSetup, type ZoneSetup } from '../domain/zones';
import { useActivityStore } from './useActivityStore';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useWorkoutStore } from './useWorkoutStore';

/**
 * The training picture, assembled from every kind of session the app records.
 *
 * Load comes from three places — recorded routes, typed-in conditioning, and
 * lifting — because a fitness curve built from runs alone tells a lifter who
 * also runs that they are detraining every time they have a heavy week. What
 * matters for the model is that *something* costly happened, not which screen
 * it was entered on.
 */

export interface TrainingPicture {
  fitness: ReturnType<typeof readFitness>;
  series: ReturnType<typeof fitnessSeries>;
  bests: EffortRecord[];
  predictions: Prediction[];
  zones: ZoneSetup | null;
  /** Days of history the curves were built from. */
  days: number;
}

/** How far back the curves are built. Long enough for the slow one to settle. */
const WINDOW_DAYS = 180;

export function useTraining(): TrainingPicture {
  const today = todayISO();
  const activities = useActivityStore((s) => s.activities);
  const cardio = useLogStore((s) => s.cardio);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());
  const profile = useProfileStore((s) => s.profile);

  return useMemo(() => {
    const from = addDaysISO(today, -WINDOW_DAYS);
    const maxHr = zoneSetup({ measuredMaxHr: profile.maxHeartRate ?? null, age: profile.age ?? null });

    // One bucket per day, so three sessions on a Saturday sum rather than the
    // last one winning.
    const byDate = new Map<string, number>();
    const add = (date: string, load: number) => {
      if (date < from || load <= 0) return;
      byDate.set(date, (byDate.get(date) ?? 0) + load);
    };

    for (const a of activities) {
      const hrFraction = a.avgHr && maxHr ? a.avgHr / maxHr.maxHr : null;
      add(a.date, loadOf({ minutes: a.movingS / 60, effort: a.effort ?? null, hrFraction }));
    }
    for (const c of cardio) {
      add(c.date, loadOf({ minutes: c.minutes, effort: c.effort ?? null }));
    }
    for (const w of workouts) {
      // A lifting session has no duration the app can trust, so it is costed
      // from its own effort rating over an assumed hour. Crude, and better
      // than pretending a heavy Wednesday did nothing.
      add(w.date, loadOf({ minutes: 60, effort: w.effort ?? 3 }));
    }

    const days: LoadDay[] = [...byDate.entries()].map(([date, load]) => ({ date, load }));
    const series = days.length ? fitnessSeries(days, { from, to: today }) : [];
    const bests = allTimeBests(activities.map((a) => ({ id: a.id, name: a.name, date: a.date, efforts: a.efforts })));

    return {
      fitness: readFitness(series),
      series,
      bests,
      predictions: predictRaces(bests, today),
      zones: maxHr,
      days: days.length,
    };
  }, [today, activities, cardio, workouts, profile.maxHeartRate, profile.age]);
}

export { estimatedMaxHr };
