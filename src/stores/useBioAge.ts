import { useMemo } from 'react';
import { todayISO } from '../domain/date';
import { bioAge, projectBioAge, type BioAge, type BioAgeProjection } from '../domain/bioAge';
import { baselineFor } from '../domain/vitals';
import { bodyFatSeries, defaultFormula } from '../domain/bodyFat';
import { totalCardio, cardioInWeek } from '../domain/cardio';
import { lastNDays } from '../domain/date';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useVitalsStore } from './useVitalsStore';
import { useWorkoutStore } from './useWorkoutStore';

export interface BioAgeReading {
  now: BioAge | null;
  projection: BioAgeProjection | null;
}

/**
 * The fitness-age index and where it is heading.
 *
 * Fed from trailing averages rather than today's numbers: a single bad night
 * is not ageing, and an index that moved three years because somebody slept
 * badly once would be worthless within a week.
 */
export function useBioAge(): BioAgeReading {
  const profile = useProfileStore((s) => s.profile);
  const vitals = useVitalsStore((s) => s.days);
  const sleepLogs = useLogStore((s) => s.sleep);
  const measurements = useLogStore((s) => s.measurements);
  const cardioSessions = useLogStore((s) => s.cardio);
  const workouts = useWorkoutStore((s) => s.completedWorkouts());

  return useMemo(() => {
    const today = todayISO();
    if (profile.age == null) return { now: null, projection: null };

    const rhr = baselineFor(vitals, 'restingHeartRate', { today, windowDays: 30 });
    const hrv = baselineFor(vitals, 'hrvMs', { today, windowDays: 30 });

    const nights = sleepLogs.filter((l) => l.minutes > 0).slice(0, 30);
    const sleepMinutes = nights.length >= 5
      ? nights.reduce((a, l) => a + l.minutes, 0) / nights.length
      : null;

    const bodyFat = bodyFatSeries(measurements, defaultFormula(profile.sex), profile.heightCm);
    const week = lastNDays(7);
    const cardioMinutes = totalCardio(cardioInWeek(cardioSessions, week)).minutes;
    const liftingMinutes = workouts
      .filter((w) => week.includes(w.date))
      .reduce((a, w) => a + (w.durationSeconds ?? 0) / 60, 0);

    const input = {
      chronologicalAge: profile.age,
      sex: profile.sex,
      restingHeartRate: rhr?.mean ?? null,
      hrvMs: hrv?.mean ?? null,
      sleepMinutes,
      bodyFatPct: bodyFat.length > 0 ? bodyFat[bodyFat.length - 1]!.pct : null,
      activityMinutesPerWeek: cardioMinutes + liftingMinutes > 0 ? cardioMinutes + liftingMinutes : null,
    };

    const now = bioAge(input);
    if (!now) return { now: null, projection: null };

    // The projection walks the index back over the vitals history, recomputing
    // it as of each earlier day. Anything simpler — storing a snapshot when
    // the screen happens to be opened — would give a trend made of when
    // somebody looked at their phone.
    const history: { date: string; years: number }[] = [];
    for (const back of [30, 21, 14, 7, 0]) {
      const asOf = shift(today, -back);
      const pastRhr = baselineFor(vitals, 'restingHeartRate', { today: asOf, windowDays: 30 });
      const pastHrv = baselineFor(vitals, 'hrvMs', { today: asOf, windowDays: 30 });
      if (!pastRhr && !pastHrv) continue;
      const past = bioAge({
        ...input,
        restingHeartRate: pastRhr?.mean ?? null,
        hrvMs: pastHrv?.mean ?? null,
      });
      if (past) history.push({ date: asOf, years: past.years });
    }

    return { now, projection: projectBioAge(history) };
  }, [profile, vitals, sleepLogs, measurements, cardioSessions, workouts]);
}

function shift(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
