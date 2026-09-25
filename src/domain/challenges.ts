import { addDaysISO, daysBetweenDates } from './date';
import type { ISODate, UUID } from './types';

/**
 * Challenges: a target, a window, and an honest answer about whether you are
 * going to make it.
 *
 * **What is deliberately absent: a global challenge.** The version of this
 * everybody knows — a hundred thousand people chasing the same badge — needs
 * a hundred thousand people, and a "Global" tab listing one participant is
 * worse than no tab at all. What is here instead is a target of your own,
 * which is useful on day one with nobody else installed, and the screen says
 * why rather than leaving a suspiciously empty second option.
 *
 * Nothing here knows whose activities it is counting. `progressOf` takes
 * entries and a window, so the same functions answer "have I run 100 km this
 * month" and "has the club run 1,000" — the caller decides which entries to
 * hand over. That is why there is no `scope` field: a scope on the challenge
 * would be a second source of truth about a question the entries already
 * answer.
 *
 * The interesting part is not the counting. It is `standingOf`, which answers
 * "am I on track" by comparing how much of the target is done against how
 * much of the window has gone — and which refuses to answer before the
 * challenge starts, because "behind" on a challenge that has not begun is
 * both wrong and discouraging.
 */

export type ChallengeMetric = 'distance' | 'elevation' | 'time' | 'activities';

export interface Challenge {
  id: UUID;
  name: string;
  metric: ChallengeMetric;
  /** Metres, metres, seconds or a count, matching the metric. */
  target: number;
  /** Inclusive. */
  from: ISODate;
  /** Inclusive. */
  to: ISODate;
  createdAt: string;
}

/** One contribution towards a challenge. */
export interface ChallengeEntry {
  date: ISODate;
  distanceM?: number | null;
  elevationGainM?: number | null;
  movingSeconds?: number | null;
}

export function valueOf(entry: ChallengeEntry, metric: ChallengeMetric): number {
  switch (metric) {
    case 'distance':
      return entry.distanceM ?? 0;
    case 'elevation':
      return entry.elevationGainM ?? 0;
    case 'time':
      return entry.movingSeconds ?? 0;
    case 'activities':
      return 1;
  }
}

export function inWindow(challenge: Challenge, date: ISODate): boolean {
  return date >= challenge.from && date <= challenge.to;
}

// ------------------------------------------------------------ progress -----

export interface ChallengeProgress {
  value: number;
  target: number;
  /** 0–1, clamped. A challenge does not go past full. */
  fraction: number;
  complete: boolean;
  /** How many entries counted, for "12 activities" under the bar. */
  entries: number;
}

export function progressOf(challenge: Challenge, entries: ChallengeEntry[]): ChallengeProgress {
  const counted = entries.filter((e) => inWindow(challenge, e.date));
  const value = counted.reduce((sum, e) => sum + valueOf(e, challenge.metric), 0);
  const target = Math.max(1, challenge.target);
  return {
    value,
    target: challenge.target,
    fraction: Math.max(0, Math.min(1, value / target)),
    complete: value >= challenge.target,
    entries: counted.length,
  };
}

// -------------------------------------------------------------- timing -----

export type ChallengeStatus = 'upcoming' | 'active' | 'ended';

export function statusOf(challenge: Challenge, today: ISODate): ChallengeStatus {
  if (today < challenge.from) return 'upcoming';
  if (today > challenge.to) return 'ended';
  return 'active';
}

/** Days remaining, counting today. Zero once the window has closed. */
export function daysLeft(challenge: Challenge, today: ISODate): number {
  if (today > challenge.to) return 0;
  const start = today < challenge.from ? challenge.from : today;
  return daysBetweenDates(start, challenge.to) + 1;
}

/** Total days in the window, counting both ends. */
export function windowDays(challenge: Challenge): number {
  return Math.max(1, daysBetweenDates(challenge.from, challenge.to) + 1);
}

/**
 * What is left per remaining day.
 *
 * Null when there is nothing to do — either it is already done, or the window
 * has closed and no amount per day would help. A number here is a promise
 * that doing it would finish the challenge.
 */
export function perDayNeeded(challenge: Challenge, progress: ChallengeProgress, today: ISODate): number | null {
  if (progress.complete) return null;
  const left = daysLeft(challenge, today);
  if (left <= 0) return null;
  return (challenge.target - progress.value) / left;
}

// ------------------------------------------------------------ standing -----

export type Standing = 'not_started' | 'ahead' | 'on_track' | 'behind' | 'done' | 'missed';

export interface ChallengeStanding {
  standing: Standing;
  /** What the pace so far projects onto the full window. Null before it starts. */
  projected: number | null;
  read: string;
}

/**
 * How much of the window has gone, counting today as spent.
 *
 * Today counts because a challenge is judged on days finished, and on the
 * morning of day one nothing has been done yet — treating day one as
 * untouched would report everybody as perfectly on track until midnight.
 */
export function elapsedFraction(challenge: Challenge, today: ISODate): number {
  if (today < challenge.from) return 0;
  if (today > challenge.to) return 1;
  return (daysBetweenDates(challenge.from, today) + 1) / windowDays(challenge);
}

/** A small allowance either side of the line, so "on track" means something. */
export const ON_TRACK_TOLERANCE = 0.05;

export function standingOf(challenge: Challenge, progress: ChallengeProgress, today: ISODate): ChallengeStanding {
  const status = statusOf(challenge, today);

  if (progress.complete) {
    return {
      standing: 'done',
      projected: progress.value,
      read: status === 'active' ? 'Done, with days to spare.' : 'Done.',
    };
  }

  if (status === 'upcoming') {
    // "Behind" on something that has not started is both wrong and
    // discouraging, so this refuses to guess.
    return { standing: 'not_started', projected: null, read: 'Not started yet.' };
  }

  if (status === 'ended') {
    const short = challenge.target - progress.value;
    return {
      standing: 'missed',
      projected: progress.value,
      read: `Finished ${formatShortfall(short, challenge.metric)} short.`,
    };
  }

  const elapsed = elapsedFraction(challenge, today);
  const projected = elapsed > 0 ? progress.value / elapsed : 0;
  const ratio = progress.fraction / elapsed;

  if (ratio >= 1 + ON_TRACK_TOLERANCE) {
    return { standing: 'ahead', projected, read: 'Ahead of the pace this needs.' };
  }
  if (ratio >= 1 - ON_TRACK_TOLERANCE) {
    return { standing: 'on_track', projected, read: 'On the pace this needs.' };
  }
  return { standing: 'behind', projected, read: 'Behind the pace this needs.' };
}

function formatShortfall(amount: number, metric: ChallengeMetric): string {
  if (metric === 'activities') return `${Math.ceil(amount)} ${Math.ceil(amount) === 1 ? 'activity' : 'activities'}`;
  if (metric === 'time') return `${Math.ceil(amount / 60)} min`;
  return `${Math.round(amount)} m`;
}

// ------------------------------------------------------------ authoring ----

export interface ChallengeDraft {
  name: string;
  metric: ChallengeMetric;
  target: number;
  from: ISODate;
  to: ISODate;
}

export function challengeProblem(draft: ChallengeDraft): string | null {
  if (!draft.name.trim()) return 'Give it a name.';
  if (!Number.isFinite(draft.target) || draft.target <= 0) return 'The target has to be more than nothing.';
  if (draft.to < draft.from) return 'The end has to come after the start.';
  return null;
}

/** The calendar month containing a date, which is what most of these are. */
export function monthWindow(anyDayIn: ISODate): { from: ISODate; to: ISODate } {
  const from = `${anyDayIn.slice(0, 7)}-01`;
  // The last day of the month is the day before the first of the next, which
  // avoids a table of month lengths and a February special case.
  const [y, m] = [Number(anyDayIn.slice(0, 4)), Number(anyDayIn.slice(5, 7))];
  const nextMonthFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to: addDaysISO(nextMonthFirst, -1) };
}

export const CHALLENGE_SCOPE_NOTE =
  'There is no global challenge here. That version of this needs a hundred thousand people chasing the same badge, and a leaderboard with one name on it is worse than no leaderboard. A target of your own works on day one, which is the point.';
