import type { ISODate } from './types';
import { daysBetweenDates, todayISO, weekdayIndex } from './date';

/**
 * Scheduled check-ins, monthly summaries, thinking modes and Ghost Mode.
 *
 * The thread running through all four is restraint. An app that can message
 * you has to be careful about when: a check-in that fires whether or not
 * there is anything to say trains people to ignore it, and once ignored it
 * never works again. So a check-in is due on a schedule *and* only fires when
 * it has something, and Ghost Mode exists to turn the whole apparatus off
 * without anyone having to delete their data.
 */

export type CheckInCadence = 'daily' | 'weekdays' | 'weekly' | 'fortnightly' | 'monthly' | 'off';

export const CADENCE_LABEL: Record<CheckInCadence, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  fortnightly: 'Every two weeks',
  monthly: 'Monthly',
  off: 'Never',
};

export interface CheckIn {
  id: string;
  label: string;
  cadence: CheckInCadence;
  /** Minutes past midnight. */
  timeMinutes: number;
  /** 0 = Monday. Only read for weekly and fortnightly. */
  weekday?: number;
  lastFiredOn?: ISODate | null;
  enabled: boolean;
}

export const DEFAULT_CHECK_INS: Omit<CheckIn, 'id'>[] = [
  { label: 'Morning readiness', cadence: 'daily', timeMinutes: 7 * 60 + 30, enabled: false },
  { label: 'Evening wrap-up', cadence: 'daily', timeMinutes: 21 * 60, enabled: false },
  { label: 'Weekly review', cadence: 'weekly', timeMinutes: 18 * 60, weekday: 6, enabled: true },
  { label: 'Monthly summary', cadence: 'monthly', timeMinutes: 10 * 60, enabled: true },
];

/**
 * Whether a check-in is due.
 *
 * The `lastFiredOn` guard is what stops a daily check-in firing five times
 * because the app was opened five times after its hour. Cadence decides
 * whether today is a candidate; the guard decides whether it already happened.
 */
export function isDue(
  checkIn: CheckIn,
  now: Date = new Date(),
  today: ISODate = todayISO(),
): boolean {
  if (!checkIn.enabled || checkIn.cadence === 'off') return false;
  if (checkIn.lastFiredOn === today) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (minutesNow < checkIn.timeMinutes) return false;

  // `weekdayIndex` is JavaScript's getDay(), where 0 is Sunday. Everything in
  // this file is Monday-first — the DAY table below, the weekday defaults,
  // and how the rest of the app counts a training week — so convert once,
  // here, rather than leaving two conventions to collide. Without this, a
  // "weekdays" check-in fired on Sunday and skipped Friday.
  const dow = (weekdayIndex(today) + 6) % 7;

  switch (checkIn.cadence) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow <= 4;
    case 'weekly':
      return dow === (checkIn.weekday ?? 6);
    case 'fortnightly': {
      if (dow !== (checkIn.weekday ?? 6)) return false;
      // Without a previous firing, the first matching day is the one.
      if (!checkIn.lastFiredOn) return true;
      return daysBetweenDates(checkIn.lastFiredOn, today) >= 14;
    }
    case 'monthly':
      // The first of the month, or the first open after it — a summary that
      // silently skips a month because nobody opened the app on the 1st is
      // worse than one that arrives on the 3rd.
      if (!checkIn.lastFiredOn) return true;
      return today.slice(0, 7) !== checkIn.lastFiredOn.slice(0, 7);
    default:
      return false;
  }
}

/** The next check-ins due, soonest first. */
export function dueNow(checkIns: CheckIn[], now: Date = new Date(), today: ISODate = todayISO()): CheckIn[] {
  return checkIns.filter((c) => isDue(c, now, today)).sort((a, b) => a.timeMinutes - b.timeMinutes);
}

/** "7:30 am". */
export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm < 10 ? '0' : ''}${mm} ${suffix}`;
}

export function describeCheckIn(checkIn: CheckIn): string {
  if (!checkIn.enabled || checkIn.cadence === 'off') return 'Off';
  const when = formatTime(checkIn.timeMinutes);
  const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  switch (checkIn.cadence) {
    case 'daily':
      return `Every day at ${when}`;
    case 'weekdays':
      return `Weekdays at ${when}`;
    case 'weekly':
      return `${DAY[checkIn.weekday ?? 6]}s at ${when}`;
    case 'fortnightly':
      return `Every other ${DAY[checkIn.weekday ?? 6]} at ${when}`;
    case 'monthly':
      return `Start of each month, around ${when}`;
    default:
      return 'Off';
  }
}

// ------------------------------------------------------ ghost mode ----

export interface GhostMode {
  on: boolean;
  /** When it should lift on its own. Null means until turned off. */
  until: ISODate | null;
}

/**
 * Everything Ghost Mode suppresses.
 *
 * Deliberately a list rather than a boolean scattered through the app: the
 * point of a mode like this is that somebody can read exactly what it does
 * before trusting it. It never hides or deletes data — it stops the app
 * talking, scoring and nagging.
 */
export const GHOST_SUPPRESSES = [
  'Every scheduled reminder and notification',
  'Check-ins — daily, weekly and the monthly summary',
  'Streak breaks — on days you open the app, a streak pauses rather than resets',
  'Coach messages you did not ask for',
  'Your rank on the home screen',
];

export function ghostActive(ghost: GhostMode, today: ISODate = todayISO()): boolean {
  if (!ghost.on) return false;
  if (!ghost.until) return true;
  return today <= ghost.until;
}

export function describeGhost(ghost: GhostMode, today: ISODate = todayISO()): string {
  if (!ghostActive(ghost, today)) return 'Off. The app behaves normally.';
  if (!ghost.until) return 'On until you turn it off. Nothing is being deleted — the app is just quiet.';
  const days = daysBetweenDates(today, ghost.until);
  return `On for ${days === 0 ? 'the rest of today' : `${days + 1} more days`}. Nothing is being deleted — the app is just quiet.`;
}

// ---------------------------------------------------- thinking mode ----

export type ThinkingMode = 'fast' | 'thorough' | 'adaptive';

export const THINKING_LABEL: Record<ThinkingMode, string> = {
  fast: 'Fast',
  thorough: 'Thorough',
  adaptive: 'Adaptive',
};

export const THINKING_NOTE: Record<ThinkingMode, string> = {
  fast: 'Short answers, straight away. Best for "what should I do now".',
  thorough: 'Works through your history before answering. Slower, better on anything about a trend.',
  adaptive: 'Fast for quick questions, thorough when the question needs it.',
};

/**
 * Which mode a given question should actually run in.
 *
 * Adaptive is the interesting one: a question about a trend, a comparison or
 * a plan wants the whole history; "what should I eat now" does not, and
 * making someone wait for it is a worse answer even when it is a better one.
 */
export function effectiveMode(mode: ThinkingMode, question: string): Exclude<ThinkingMode, 'adaptive'> {
  if (mode !== 'adaptive') return mode;
  const text = question.toLowerCase();
  const deep = [
    'why', 'trend', 'compare', 'over time', 'last month', 'progress', 'plateau',
    'plan', 'should i change', 'analyse', 'analyze', 'pattern', 'history',
  ];
  return deep.some((word) => text.includes(word)) ? 'thorough' : 'fast';
}

export const CHECK_IN_NOTE =
  'A check-in only arrives when there is something worth saying. One that fires on a timer whether or not it has anything trains you to ignore it, and once ignored it never works again.';
