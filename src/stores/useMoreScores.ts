import { useMemo } from 'react';
import { todayISO } from '../domain/date';
import { bodyFatSeries, defaultFormula } from '../domain/bodyFat';
import { baselineFor, type VitalKey } from '../domain/vitals';
import {
  cardioFocus,
  heartRateRecovery,
  projectBodyFat,
  projectComposition,
  sleepNeed,
  stressScore,
  type CardioFocusReading,
  type HeartRateRecovery,
  type Projection,
  type SleepNeed,
  type StressReading,
} from '../domain/moreScores';
import { useJournalStore } from './useJournalStore';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useVitalsStore } from './useVitalsStore';

export interface MoreScores {
  stress: StressReading | null;
  cardioFocus: CardioFocusReading;
  hrRecovery: HeartRateRecovery | null;
  weightProjection: Projection | null;
  bodyFatProjection: Projection | null;
  sleepNeed: SleepNeed | null;
}

/**
 * The second rank of readings, assembled in one place.
 *
 * Same reason as `useScores`: these all read from three or four stores each,
 * and a number on a card has to be the same number on its own screen. Every
 * one of them can come back null, which is the point — none of these has a
 * value worth inventing when the data behind it is not there.
 */
export function useMoreScores(): MoreScores {
  const today = todayISO();
  const profile = useProfileStore((s) => s.profile);
  const targets = useProfileStore((s) => s.targets);
  const sleepLogs = useLogStore((s) => s.sleep);
  const cardio = useLogStore((s) => s.cardio);
  const weights = useLogStore((s) => s.weight);
  const measurements = useLogStore((s) => s.measurements);
  const vitals = useVitalsStore((s) => s.days);
  const journal = useJournalStore((s) => s.entries);

  return useMemo(() => {
    const todayVitals = vitals.find((d) => d.date === today) ?? null;

    // A z-score needs both today's value and the athlete's own baseline. With
    // either missing the component drops out rather than defaulting to zero,
    // which would read as "perfectly average" — a claim nothing supports.
    const z = (key: Extract<VitalKey, 'hrvMs' | 'restingHeartRate'>): number | null => {
      const value = todayVitals?.[key];
      if (typeof value !== 'number') return null;
      const base = baselineFor(vitals, key, { today });
      if (!base || base.sd <= 0) return null;
      return (value - base.mean) / base.sd;
    };

    const lastNight = sleepLogs.find((l) => l.date === today);
    const reported = journal.find((e) => e.date === today)?.values.stress ?? null;

    const series = bodyFatSeries(measurements, defaultFormula(profile.sex), profile.heightCm);

    return {
      stress: stressScore({
        hrvZ: z('hrvMs'),
        rhrZ: z('restingHeartRate'),
        reported: typeof reported === 'number' ? reported : null,
        sleepRatio:
          lastNight && targets.sleepMinutes > 0 ? lastNight.minutes / targets.sleepMinutes : null,
      }),
      cardioFocus: cardioFocus(cardio, today),
      hrRecovery: heartRateRecovery(vitals, today),
      weightProjection: projectComposition(
        weights.map((w: { date: string; weightKg: number }) => ({ date: w.date, value: w.weightKg })),
        { horizonDays: 30, maxPerWeek: 1.5, label: 'Weight', unit: 'kg' },
      ),
      bodyFatProjection: projectBodyFat(series),
      sleepNeed: sleepNeed(sleepLogs, today, targets.sleepMinutes),
    };
  }, [today, vitals, sleepLogs, cardio, weights, measurements, journal, targets.sleepMinutes, profile.sex, profile.heightCm]);
}
