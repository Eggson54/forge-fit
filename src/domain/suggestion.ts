import { VOLUME_LANDMARKS, weeklySetsPerMuscle, type MuscleVolume } from './volume';
import type { MuscleGroup, Workout } from './types';

export type SuggestionKind = 'logged' | 'rest' | 'routine' | 'focus';

export interface TrainingSuggestion {
  kind: SuggestionKind;
  /** Headline for the card: a routine name, a body part, or a state. */
  title: string;
  /** Why this, in the user's own numbers. */
  reason: string;
  routineId?: string;
  focus: MuscleGroup[];
}

export interface SuggestionInput {
  /** Completed workouts; only the last seven days are read. */
  workouts: Workout[];
  today: string;
  weekDates: string[];
  trainingDaysPerWeek: number;
  routines: { id: string; name: string; muscles: MuscleGroup[] }[];
}

/** How far below its weekly minimum a muscle is, largest deficit first. */
export function volumeDeficits(volume: MuscleVolume): { muscle: MuscleGroup; missing: number }[] {
  return (Object.keys(VOLUME_LANDMARKS) as MuscleGroup[])
    .map((muscle) => ({ muscle, missing: (VOLUME_LANDMARKS[muscle]?.min ?? 0) - (volume[muscle] ?? 0) }))
    .filter((d) => d.missing > 0)
    .sort((a, b) => b.missing - a.missing);
}

/**
 * What to train today, from the athlete's own week.
 *
 * The card this feeds used to read "Rest / Open" on every day nothing was
 * scheduled, which is the one thing it could say without looking at anything.
 * The order below is deliberate: a session already logged wins over any
 * suggestion, and a met weekly target wins over a volume gap — telling someone
 * who has hit five of five sessions to go again is how an accountability app
 * turns into a nag.
 */
export function suggestToday(input: SuggestionInput): TrainingSuggestion {
  const { workouts, today, weekDates, trainingDaysPerWeek, routines } = input;
  const done = workouts.filter((w) => w.status === 'completed');

  if (done.some((w) => w.date === today)) {
    return { kind: 'logged', title: 'Trained today', reason: 'Logged and counted. Recovery is part of the program.', focus: [] };
  }

  const thisWeek = done.filter((w) => weekDates.includes(w.date));
  if (thisWeek.length >= trainingDaysPerWeek) {
    return {
      kind: 'rest',
      title: 'Rest day',
      reason: `${thisWeek.length} of ${trainingDaysPerWeek} sessions done this week. Train if you want to; you don't owe one.`,
      focus: [],
    };
  }

  const volume = weeklySetsPerMuscle(thisWeek);
  const deficits = volumeDeficits(volume);

  // Prefer a routine that covers the muscles furthest behind, so the suggestion
  // is one tap from a session rather than a body part to go figure out.
  if (routines.length > 0 && deficits.length > 0) {
    const rank = new Map(deficits.map((d, i) => [d.muscle, deficits.length - i]));
    const scored = routines
      .map((r) => ({ r, score: r.muscles.reduce((a, m) => a + (rank.get(m) ?? 0), 0) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best && best.score > 0) {
      const behind = best.r.muscles.filter((m) => rank.has(m)).slice(0, 2).map(niceMuscle);
      return {
        kind: 'routine',
        title: best.r.name,
        reason: behind.length
          ? `${behind.join(' and ')} ${behind.length > 1 ? 'are' : 'is'} behind for the week.`
          : 'Next up in your saved routines.',
        routineId: best.r.id,
        focus: best.r.muscles,
      };
    }
  }

  if (deficits.length > 0) {
    const top = deficits.slice(0, 2);
    return {
      kind: 'focus',
      title: top.map((d) => niceMuscle(d.muscle)).join(' & '),
      reason: `${Math.round(top[0]!.missing)} sets short of the weekly range for ${niceMuscle(top[0]!.muscle).toLowerCase()}.`,
      focus: top.map((d) => d.muscle),
    };
  }

  return {
    kind: 'focus',
    title: 'Open session',
    reason: `${thisWeek.length} of ${trainingDaysPerWeek} sessions this week. Every muscle is inside its range.`,
    focus: [],
  };
}

function niceMuscle(m: MuscleGroup): string {
  return m.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
