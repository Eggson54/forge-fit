import type { ISODate, StreakState } from './types';

export const emptyStreaks = (): StreakState => ({
  workout: 0,
  protein: 0,
  nutrition: 0,
  hydration: 0,
  daily: 0,
  longestDaily: 0,
  lastActiveDate: null,
});

/** Days between two ISO dates (b - a), calendar-based, ignoring time. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

export interface DailyOutcome {
  date: ISODate;
  workoutDone: boolean;
  proteinHit: boolean;
  nutritionHit: boolean;
  hydrationHit: boolean;
  /** A "complete" day (e.g. discipline >= threshold) advances the daily streak. */
  dayComplete: boolean;
  /**
   * A day the athlete was not due to train.
   *
   * Without this a rest day reset the workout streak, so training four days a
   * week — exactly as planned — could never show a streak above one. Recovery
   * is part of the programme; a streak that punishes it is measuring the wrong
   * thing.
   */
  restDay?: boolean;
  /**
   * Ghost Mode was on for this day.
   *
   * Every streak carries forward untouched and the date advances, so the run
   * neither grows nor breaks — which is the promise Ghost Mode makes. It can
   * only hold for days the app was actually opened; a phone left in a drawer
   * for a fortnight still comes back to a gap, and no flag in here can
   * invent the days nobody was there for.
   */
  paused?: boolean;
}

/**
 * Fold a single day's outcome into the streak state. Called once per day when
 * the day is finalized. A gap of >1 day resets the daily streak; a same-day
 * re-computation is idempotent.
 */
export function applyDailyOutcome(prev: StreakState, o: DailyOutcome): StreakState {
  if (o.paused) return { ...prev, lastActiveDate: o.date };

  const next: StreakState = { ...prev };

  if (prev.lastActiveDate === o.date) {
    // Re-computing the same day: recompute per-metric streaks without double count.
    return recomputeSameDay(prev, o);
  }

  const gap = prev.lastActiveDate ? daysBetween(prev.lastActiveDate, o.date) : 1;
  const continuous = gap === 1;

  const bump = (streak: number, hit: boolean) => (hit ? (continuous ? streak + 1 : 1) : 0);

  // A rest day holds the workout streak rather than ending it. A gap of more
  // than a day still resets: that is absence, not planned recovery.
  next.workout = o.restDay && !o.workoutDone ? (continuous ? prev.workout : 0) : bump(prev.workout, o.workoutDone);
  next.protein = bump(prev.protein, o.proteinHit);
  next.nutrition = bump(prev.nutrition, o.nutritionHit);
  next.hydration = bump(prev.hydration, o.hydrationHit);
  next.daily = o.dayComplete ? (continuous ? prev.daily + 1 : 1) : 0;
  next.longestDaily = Math.max(prev.longestDaily, next.daily);
  next.lastActiveDate = o.date;

  return next;
}

function recomputeSameDay(prev: StreakState, o: DailyOutcome): StreakState {
  // On same-day recompute, a metric that was counted but is now unmet drops by 1.
  const adjust = (streak: number, hit: boolean) => (hit ? Math.max(streak, 1) : Math.max(0, streak - 1));
  const workout = o.restDay && !o.workoutDone ? prev.workout : adjust(prev.workout, o.workoutDone);
  const daily = o.dayComplete ? Math.max(prev.daily, 1) : Math.max(0, prev.daily - 1);
  return {
    workout,
    protein: adjust(prev.protein, o.proteinHit),
    nutrition: adjust(prev.nutrition, o.nutritionHit),
    hydration: adjust(prev.hydration, o.hydrationHit),
    daily,
    longestDaily: Math.max(prev.longestDaily, daily),
    lastActiveDate: o.date,
  };
}
