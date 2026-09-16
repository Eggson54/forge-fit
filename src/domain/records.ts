import { epley1RM } from './strength';
import { isWarmupSet } from './sets';
import type { MuscleGroup, Workout } from './types';

export interface RecordSet {
  weightKg: number;
  reps: number;
  e1RMKg: number;
  date: string;
  workoutId: string;
}

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  /** Best estimated max, and the set that produced it. */
  best: RecordSet;
  /** Heaviest single set, which is often a different set entirely. */
  heaviest: RecordSet;
  sessions: number;
  /**
   * Gain in estimated max since the first session containing this lift. Null
   * when there is only one session — no gain has been observed, which is not
   * the same as 0%.
   */
  improvementPct: number | null;
}

/**
 * Best lifts per exercise, reconstructed from the log rather than read from a
 * running tally.
 *
 * The store keeps a `prs` map of exercise to best e1RM, but a number with no
 * set behind it cannot say what you lifted or when — and it cannot be checked.
 * Deriving from history means the screen and the log can never disagree.
 */
export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const byExercise = new Map<string, { record: PersonalRecord; firstE1RM: number; dates: Set<string> }>();

  const ordered = [...workouts]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const workout of ordered) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed || isWarmupSet(set) || !set.weightKg || !set.reps) continue;
        const candidate: RecordSet = {
          weightKg: set.weightKg,
          reps: set.reps,
          e1RMKg: epley1RM(set.weightKg, set.reps),
          date: workout.date,
          workoutId: workout.id,
        };

        const found = byExercise.get(exercise.exerciseId);
        if (!found) {
          byExercise.set(exercise.exerciseId, {
            record: {
              exerciseId: exercise.exerciseId,
              name: exercise.name,
              primaryMuscle: exercise.primaryMuscle,
              best: candidate,
              heaviest: candidate,
              sessions: 0,
              improvementPct: null,
            },
            firstE1RM: candidate.e1RMKg,
            dates: new Set(),
          });
        } else {
          if (candidate.e1RMKg > found.record.best.e1RMKg) found.record.best = candidate;
          // Ties go to the set that needed fewer reps to move the same weight.
          if (
            candidate.weightKg > found.record.heaviest.weightKg ||
            (candidate.weightKg === found.record.heaviest.weightKg && candidate.reps > found.record.heaviest.reps)
          ) {
            found.record.heaviest = candidate;
          }
        }
        byExercise.get(exercise.exerciseId)!.dates.add(workout.date);
      }
    }
  }

  return [...byExercise.values()]
    .map(({ record, firstE1RM, dates }) => ({
      ...record,
      sessions: dates.size,
      improvementPct:
        dates.size > 1 && firstE1RM > 0
          ? Math.round(((record.best.e1RMKg - firstE1RM) / firstE1RM) * 1000) / 10
          : null,
    }))
    .sort((a, b) => b.best.e1RMKg - a.best.e1RMKg);
}

export interface PrEvent extends RecordSet {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
}

/**
 * Every set that beat the best before it, newest first.
 *
 * This is derived rather than read from the `isPr` flag the logger writes.
 * The flag only exists on sets logged through the app while that lift already
 * had a history in the store, so a restored backup or a seeded log shows none
 * at all — and a screen whose "recent records" section is empty for a user
 * with ten sessions is just wrong.
 */
export function recentPrEvents(workouts: Workout[], limit = 12): PrEvent[] {
  const ordered = [...workouts]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const bestSoFar = new Map<string, number>();
  const events: PrEvent[] = [];

  for (const workout of ordered) {
    for (const exercise of workout.exercises) {
      // Within one session only the top set counts: a climbing warm-up to a
      // top single would otherwise post four records in a row.
      let bestOfSession: PrEvent | null = null;
      for (const set of exercise.sets) {
        if (!set.completed || isWarmupSet(set) || !set.weightKg || !set.reps) continue;
        const e1RMKg = epley1RM(set.weightKg, set.reps);
        if (e1RMKg <= (bestSoFar.get(exercise.exerciseId) ?? 0)) continue;
        if (bestOfSession && e1RMKg <= bestOfSession.e1RMKg) continue;
        bestOfSession = {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          primaryMuscle: exercise.primaryMuscle,
          weightKg: set.weightKg,
          reps: set.reps,
          e1RMKg,
          date: workout.date,
          workoutId: workout.id,
        };
      }
      if (bestOfSession) {
        // The first session with a lift is a baseline, not a record broken.
        if (bestSoFar.has(exercise.exerciseId)) events.push(bestOfSession);
        bestSoFar.set(exercise.exerciseId, bestOfSession.e1RMKg);
      }
    }
  }

  return events.reverse().slice(0, limit);
}
