import type { ISODate, MuscleGroup, Workout } from './types';
import { daysBetweenDates, todayISO } from './date';

import { VOLUME_LANDMARKS, muscleLabel, weeklySetsPerMuscle } from './volume';

/**
 * How long it has been since each muscle did any work.
 *
 * The weekly volume map answers "how much"; this answers "how recently", and
 * they disagree more often than you would expect — twenty sets of chest all on
 * one Monday reads as healthy volume and as a muscle that has been idle since.
 *
 * The thresholds come from the ordinary training literature on how long a
 * trained muscle stays in an elevated-synthesis window (roughly a couple of
 * days). They are a description of a common pattern, not a rule: plenty of
 * good programmes sit outside them on purpose.
 */

export type RecoveryState = 'today' | 'recovering' | 'ready' | 'overdue' | 'untrained';

export const RECOVERY_LABEL: Record<RecoveryState, string> = {
  today: 'Worked today',
  recovering: 'Recovering',
  ready: 'Ready',
  overdue: 'Waiting',
  untrained: 'Not trained',
};

export const RECOVERY_BLURB: Record<RecoveryState, string> = {
  today: 'Did its work. Leave it alone.',
  recovering: 'Inside the window where the last session is still being paid for.',
  ready: 'Recovered and available.',
  overdue: 'Nothing for over a week. Whatever it had is fading.',
  untrained: 'Nothing on record in this window at all.',
};

/** Days after which a muscle is considered available again. */
const READY_AFTER_DAYS = 2;
/** Days after which the last session stops counting for much. */
const OVERDUE_AFTER_DAYS = 8;

export interface MuscleRecovery {
  muscle: MuscleGroup;
  label: string;
  /** Null when the muscle has nothing on record in the window. */
  lastDate: ISODate | null;
  daysSince: number | null;
  state: RecoveryState;
  /** Working sets in the last seven days, for context next to the wait. */
  setsThisWeek: number;
}

/** The last date each muscle took a working set, across the given workouts. */
export function lastTrained(workouts: Workout[]): Partial<Record<MuscleGroup, ISODate>> {
  const out: Partial<Record<MuscleGroup, ISODate>> = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!ex.sets.some((s) => s.completed)) continue;
      const seen = out[ex.primaryMuscle];
      if (!seen || w.date > seen) out[ex.primaryMuscle] = w.date;
    }
  }
  return out;
}

export function recoveryState(daysSince: number | null): RecoveryState {
  if (daysSince == null) return 'untrained';
  if (daysSince <= 0) return 'today';
  if (daysSince < READY_AFTER_DAYS) return 'recovering';
  if (daysSince < OVERDUE_AFTER_DAYS) return 'ready';
  return 'overdue';
}

/**
 * Every muscle the volume landmarks track, most overdue first.
 *
 * Sorted that way on purpose: the useful end of this list is the muscles that
 * have been waiting, and burying them under whatever was trained this morning
 * would defeat the point of the screen.
 */
export function recoveryBoard(workouts: Workout[], today: ISODate = todayISO()): MuscleRecovery[] {
  const last = lastTrained(workouts);
  const weekSets = weeklySetsPerMuscle(
    workouts.filter((w) => daysBetweenDates(w.date, today) < 7 && w.date <= today),
  );

  return (Object.keys(VOLUME_LANDMARKS) as MuscleGroup[])
    .map((muscle) => {
      const lastDate = last[muscle] ?? null;
      const daysSince = lastDate ? Math.max(0, daysBetweenDates(lastDate, today)) : null;
      return {
        muscle,
        label: muscleLabel(muscle),
        lastDate,
        daysSince,
        state: recoveryState(daysSince),
        setsThisWeek: weekSets[muscle] ?? 0,
      };
    })
    .sort((a, b) => rank(b) - rank(a));
}

// Untrained sorts above a long wait, and a long wait above a short one.
function rank(r: MuscleRecovery): number {
  if (r.daysSince == null) return 1000;
  return r.daysSince;
}

/** The muscles worth pointing at, longest wait first. */
export function mostOverdue(board: MuscleRecovery[], limit = 3): MuscleRecovery[] {
  return board.filter((r) => r.state === 'overdue' || r.state === 'untrained').slice(0, limit);
}

/**
 * One line for the top of the screen.
 *
 * It says nothing rather than something empty when there is no history — a
 * recovery reading on zero workouts is a sentence pretending to be data.
 */
export function readRecovery(board: MuscleRecovery[]): string | null {
  const trained = board.filter((r) => r.daysSince != null);
  if (trained.length === 0) return null;

  const waiting = mostOverdue(board, 2);
  if (waiting.length === 0) {
    const ready = board.filter((r) => r.state === 'ready');
    if (ready.length === 0) return 'Everything you train is inside its recovery window. Today is a rest day or a light one.';
    return `${listOf(ready.slice(0, 3).map((r) => r.label))} recovered and available.`;
  }

  const worst = waiting[0]!;
  if (worst.daysSince == null) {
    return `${listOf(waiting.map((r) => r.label))} ${waiting.length > 1 ? 'have' : 'has'} nothing on record. If you train ${waiting.length > 1 ? 'them' : 'it'}, it has not been recently.`;
  }
  return `${listOf(waiting.map((r) => r.label))} ${waiting.length > 1 ? 'have' : 'has'} been waiting — ${worst.label.toLowerCase()} ${worst.daysSince} days.`;
}

function listOf(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * How full the recovery bar should read: 0 just trained, 1 fully recovered.
 *
 * A muscle with nothing on record reads as empty rather than full. Full is
 * technically true — it has had infinite rest — but on screen, next to the
 * words "Not trained", a full green bar says the opposite of what is meant.
 */
export function recoveryFraction(daysSince: number | null): number {
  if (daysSince == null) return 0;
  return Math.max(0, Math.min(1, daysSince / READY_AFTER_DAYS));
}

export const RECOVERY_CAVEAT =
  'Time since a muscle last worked, nothing more. It cannot feel how sore you are, and it does not know what your programme intends — an upper/lower split leaves half this list waiting by design. Read it as a memory aid, not an instruction.';
