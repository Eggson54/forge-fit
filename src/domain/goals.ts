import type { ISODate, UUID } from './types';
import { addDaysISO, daysBetweenDates, todayISO, weekdayIndex } from './date';

/**
 * Distance, time and climbing goals, by week, month or year.
 *
 * The interesting part is not the arithmetic, it is the *pacing*: a goal that
 * only shows a total is a goal you discover you have missed on the last day.
 * Everything here answers "am I on track", which means comparing progress
 * against elapsed time rather than against the target.
 *
 * The one thing it will not do is tell anybody to go out and make up a
 * shortfall. It reports the gap and how much per remaining day it implies;
 * whether that is sensible depends on things the app cannot see.
 */

export type GoalPeriod = 'week' | 'month' | 'year';
export type GoalMetric = 'distance' | 'time' | 'elevation' | 'activities';

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  distance: 'Distance',
  time: 'Time',
  elevation: 'Climbing',
  activities: 'Activities',
};

/** The unit a target is stored in: metres, minutes, metres, or a count. */
export const METRIC_UNIT: Record<GoalMetric, string> = {
  distance: 'm',
  time: 'min',
  elevation: 'm',
  activities: '',
};

export interface Goal {
  id: UUID;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number;
  /** Empty means every kind of activity counts. */
  types: string[];
  enabled: boolean;
}

export interface GoalContribution {
  date: ISODate;
  type: string;
  distanceM: number;
  minutes: number;
  ascentM: number;
}

// ------------------------------------------------------------- periods ----

/**
 * The window a period covers, ending today.
 *
 * Weeks run Monday to Sunday, matching the rest of the app. Months and years
 * are calendar ones — a "monthly" goal that runs on a rolling thirty days
 * never gives anyone the clean slate that makes a monthly goal work.
 */
export function periodRange(period: GoalPeriod, today: ISODate = todayISO()): { from: ISODate; to: ISODate; days: number; elapsed: number } {
  if (period === 'week') {
    const dow = (weekdayIndex(today) + 6) % 7; // Monday = 0
    const from = addDaysISO(today, -dow);
    const to = addDaysISO(from, 6);
    return { from, to, days: 7, elapsed: dow + 1 };
  }

  if (period === 'month') {
    const from = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split('-').map(Number) as [number, number];
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${today.slice(0, 7)}-${String(days).padStart(2, '0')}`;
    return { from, to, days, elapsed: Number(today.slice(8, 10)) };
  }

  const year = today.slice(0, 4);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const days = daysBetweenDates(from, to) + 1;
  return { from, to, days, elapsed: daysBetweenDates(from, today) + 1 };
}

function valueOf(metric: GoalMetric, c: GoalContribution): number {
  switch (metric) {
    case 'distance': return c.distanceM;
    case 'time': return c.minutes;
    case 'elevation': return c.ascentM;
    case 'activities': return 1;
  }
}

export interface GoalProgress {
  goal: Goal;
  done: number;
  target: number;
  /** 0–1, uncapped so overshooting is visible. */
  fraction: number;
  daysLeft: number;
  /** Where they would be if the period were spread evenly. */
  expected: number;
  /** Positive is ahead of that pace. */
  aheadBy: number;
  /** Per remaining day to finish. Null when already there or out of days. */
  perDayNeeded: number | null;
  onTrack: boolean;
  headline: string;
  detail: string;
}

export function progressFor(
  goal: Goal,
  contributions: GoalContribution[],
  today: ISODate = todayISO(),
): GoalProgress {
  const { from, to, days, elapsed } = periodRange(goal.period, today);

  const counted = contributions.filter(
    (c) => c.date >= from && c.date <= to && (goal.types.length === 0 || goal.types.includes(c.type)),
  );
  const done = counted.reduce((a, c) => a + valueOf(goal.metric, c), 0);

  const fraction = goal.target > 0 ? done / goal.target : 0;
  const daysLeft = Math.max(0, days - elapsed);
  const expected = goal.target * (elapsed / days);
  const aheadBy = done - expected;
  const remaining = Math.max(0, goal.target - done);
  const perDayNeeded = remaining <= 0 ? null : daysLeft > 0 ? remaining / daysLeft : null;
  // A day's grace: being fractionally behind on a Tuesday is not being behind.
  const onTrack = done >= expected - goal.target / days;

  return {
    goal,
    done,
    target: goal.target,
    fraction,
    daysLeft,
    expected,
    aheadBy,
    perDayNeeded,
    onTrack,
    headline: `${Math.round(fraction * 100)}% of ${PERIOD_LABEL[goal.period].toLowerCase()}`,
    detail: describe(goal, done, remaining, daysLeft, aheadBy, onTrack, perDayNeeded),
  };
}

function describe(
  goal: Goal,
  done: number,
  remaining: number,
  daysLeft: number,
  aheadBy: number,
  onTrack: boolean,
  perDayNeeded: number | null,
): string {
  void done;
  if (remaining <= 0) {
    return daysLeft > 0
      ? `Done, with ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} still to go.`
      : 'Done.';
  }
  if (daysLeft === 0) {
    return `${format(remaining, goal.metric)} short, and the period is over. Worth asking whether the target was the right one before repeating it.`;
  }
  if (onTrack) {
    return aheadBy > 0
      ? `Ahead of an even pace by ${format(aheadBy, goal.metric)}. ${format(perDayNeeded ?? 0, goal.metric)} a day for the remaining ${daysLeft} would finish it.`
      : `On pace. ${format(perDayNeeded ?? 0, goal.metric)} a day across the remaining ${daysLeft} finishes it.`;
  }
  return `Behind an even pace by ${format(-aheadBy, goal.metric)}. Finishing means ${format(perDayNeeded ?? 0, goal.metric)} a day for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} — which may or may not be a sensible week of training.`;
}

/** Human-readable, in the unit the metric is stored in. */
function format(value: number, metric: GoalMetric): string {
  if (metric === 'distance' || metric === 'elevation') {
    return value >= 1000 ? `${Math.round(value / 100) / 10} km` : `${Math.round(value)} m`;
  }
  if (metric === 'time') {
    const m = Math.round(value);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }
  return `${Math.round(value * 10) / 10}`;
}

export { format as formatGoalValue };

/**
 * A suggested target, from what they have actually been doing.
 *
 * Ten per cent above the recent average, rounded. Deliberately modest: a
 * goal screen that proposes a number nobody can hit teaches people to ignore
 * goal screens.
 */
export function suggestTarget(
  period: GoalPeriod,
  metric: GoalMetric,
  contributions: GoalContribution[],
  today: ISODate = todayISO(),
): number | null {
  const lookback = period === 'week' ? 28 : period === 'month' ? 90 : 365;
  const from = addDaysISO(today, -lookback);
  const recent = contributions.filter((c) => c.date >= from && c.date <= today);
  if (recent.length < 3) return null;

  const total = recent.reduce((a, c) => a + valueOf(metric, c), 0);
  const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const perPeriod = (total / lookback) * periodDays;
  if (perPeriod <= 0) return null;

  const suggested = perPeriod * 1.1;
  if (metric === 'activities') return Math.max(1, Math.round(suggested));
  if (metric === 'time') return Math.round(suggested / 5) * 5;
  return Math.round(suggested / 500) * 500;
}

export const GOALS_NOTE =
  'Progress is compared against how much of the period has passed, not just against the target — the point is to know on a Wednesday, not on the last day. Nothing here will tell you to go and make up a shortfall; whether that is a good idea depends on things the app cannot see.';
