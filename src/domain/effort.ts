import type { SessionEffort, Workout } from './types';

/**
 * How hard a session felt, recorded once at the end.
 *
 * Five points rather than the ten-point RPE scale. Session RPE is a
 * recollection of an hour of work; asking someone to place that to the nearest
 * tenth is asking for precision that does not exist, and a scale nobody can use
 * consistently produces a trend line made of nothing.
 */
export type { SessionEffort };

export const EFFORT_LABEL: Record<SessionEffort, string> = {
  1: 'Easy',
  2: 'Steady',
  3: 'Solid',
  4: 'Hard',
  5: 'All out',
};

export const EFFORT_BLURB: Record<SessionEffort, string> = {
  1: 'Could have done much more.',
  2: 'Comfortable throughout.',
  3: 'Worked, finished strong.',
  4: 'Had to dig for the last sets.',
  5: 'Nothing left.',
};

export const EFFORT_SCALE: SessionEffort[] = [1, 2, 3, 4, 5];

export interface EffortReading {
  /** Mean effort across rated sessions in the window, or null when none. */
  average: number | null;
  rated: number;
  total: number;
  /** Sessions at 4 or 5 in the window. */
  hard: number;
  headline: string;
  detail: string;
}

/** Above this share of hard sessions, the mix is worth remarking on. */
const HARD_SHARE_LIMIT = 0.6;

/**
 * How the recent mix of sessions felt.
 *
 * Deliberately says nothing when fewer than three sessions carry a rating:
 * two data points is an anecdote, and an app that calls one hard week
 * "overreaching" is inventing a diagnosis it cannot support.
 */
export function readEffort(workouts: Workout[], minRated = 3): EffortReading {
  const completed = workouts.filter((w) => w.status === 'completed');
  const rated = completed.filter((w) => typeof w.effort === 'number');
  const hard = rated.filter((w) => (w.effort ?? 0) >= 4).length;

  if (rated.length < minRated) {
    return {
      average: null,
      rated: rated.length,
      total: completed.length,
      hard,
      headline: 'Not enough ratings yet',
      detail: `Rate a few sessions and this starts tracking how hard your training has been feeling. ${rated.length} of ${completed.length} rated so far.`,
    };
  }

  const average = Math.round((rated.reduce((a, w) => a + (w.effort ?? 0), 0) / rated.length) * 10) / 10;
  const share = hard / rated.length;

  if (share >= HARD_SHARE_LIMIT) {
    return {
      average,
      rated: rated.length,
      total: completed.length,
      hard,
      headline: `${hard} of your last ${rated.length} felt hard`,
      detail: 'Most sessions landing at the top of the scale. Worth knowing when you plan the next block — it is a record of how it felt, not a verdict on whether it was too much.',
    };
  }

  if (average <= 2) {
    return {
      average,
      rated: rated.length,
      total: completed.length,
      hard,
      headline: 'Sessions have felt comfortable',
      detail: `Averaging ${average} out of 5 across ${rated.length} rated sessions.`,
    };
  }

  return {
    average,
    rated: rated.length,
    total: completed.length,
    hard,
    headline: `Averaging ${average} out of 5`,
    detail: `${hard} of ${rated.length} rated sessions felt hard. A mix is what most training looks like.`,
  };
}

/** Effort paired with the session's date, oldest first, for a sparkline. */
export function effortSeries(workouts: Workout[]): { date: string; value: number }[] {
  return workouts
    .filter((w) => w.status === 'completed' && typeof w.effort === 'number')
    .map((w) => ({ date: (w.completedAt ?? w.date).slice(0, 10), value: w.effort as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
