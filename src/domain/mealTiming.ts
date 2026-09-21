import type { ISODate, MealSlot, NutritionEntry } from './types';
import { addDaysISO, todayISO } from './date';
import { scaleMacros } from './nutrition';

/**
 * When the eating happens, rather than what it was.
 *
 * Every entry already carries the moment it was logged, and nothing had ever
 * read it. The window between the first and last meal of a day, the gap
 * overnight, and how protein falls across the day are all sitting in those
 * timestamps.
 *
 * One honest limit, stated on the screen as well as here: this measures when
 * food was *logged*, not when it was eaten. Someone who enters the whole day
 * at bedtime gets a five-minute eating window, and no amount of arithmetic
 * can tell that apart from a genuine one.
 */

/** Minutes past local midnight for a logged-at timestamp. */
export function minutesOfDay(isoDateTime: string): number | null {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** "7:30 am", without Intl — Hermes ships it only partially. */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm < 10 ? '0' : ''}${mm} ${suffix}`;
}

/** Hours and minutes as "14h 20m". */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

export interface DayWindow {
  date: ISODate;
  firstMinutes: number;
  lastMinutes: number;
  /** Minutes between the first and last logged meal. */
  windowMinutes: number;
  meals: number;
}

/**
 * The eating window for one day, or null when there is nothing to measure.
 *
 * A single meal is not a window — it is a point — so it returns null rather
 * than a window of zero, which would drag any average toward a fast nobody
 * did.
 */
export function dayWindow(entries: NutritionEntry[], date: ISODate): DayWindow | null {
  const times = entries
    .filter((e) => e.date === date)
    .map((e) => minutesOfDay(e.loggedAt))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;

  const firstMinutes = times[0]!;
  const lastMinutes = times[times.length - 1]!;
  if (lastMinutes <= firstMinutes) return null;

  return {
    date,
    firstMinutes,
    lastMinutes,
    windowMinutes: lastMinutes - firstMinutes,
    meals: distinctMeals(times),
  };
}

/**
 * How many separate sittings those timestamps represent.
 *
 * Entries logged within twenty minutes of each other are one meal: nobody eats
 * four meals because they entered rice, chicken, broccoli and a sauce as four
 * foods.
 */
function distinctMeals(sortedTimes: number[]): number {
  let n = 1;
  for (let i = 1; i < sortedTimes.length; i += 1) {
    if (sortedTimes[i]! - sortedTimes[i - 1]! > 20) n += 1;
  }
  return n;
}

/** Windows over the last N days, oldest first, skipping days with nothing. */
export function windowSeries(
  entries: NutritionEntry[],
  days = 14,
  today: ISODate = todayISO(),
): DayWindow[] {
  const out: DayWindow[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const w = dayWindow(entries, addDaysISO(today, -back));
    if (w) out.push(w);
  }
  return out;
}

export interface TypicalWindow {
  /** Median, not mean: one 3am snack should not move the usual first meal. */
  firstMinutes: number;
  lastMinutes: number;
  windowMinutes: number;
  days: number;
}

export function typicalWindow(series: DayWindow[]): TypicalWindow | null {
  if (series.length < 3) return null;
  return {
    firstMinutes: median(series.map((d) => d.firstMinutes)),
    lastMinutes: median(series.map((d) => d.lastMinutes)),
    windowMinutes: median(series.map((d) => d.windowMinutes)),
    days: series.length,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * The gap between the last meal of the day before and the first of this one.
 *
 * Null when either end is missing — an overnight fast measured against a day
 * nobody logged is a number about the logging, not about the eating.
 */
export function overnightFast(entries: NutritionEntry[], date: ISODate): number | null {
  const yesterday = dayEnds(entries, addDaysISO(date, -1));
  const today = dayEnds(entries, date);
  if (yesterday?.last == null || today?.first == null) return null;

  const gap = 1440 - yesterday.last + today.first;
  // Exactly twenty-four hours means the two meals landed on the same minute of
  // the clock two days running. A real fast to the minute is possible and a
  // batch of entries carrying one timestamp is far likelier, so this says
  // nothing rather than printing a confident "24h" off an artifact.
  if (gap === 1440) return null;
  return gap;
}

function dayEnds(entries: NutritionEntry[], date: ISODate): { first: number; last: number } | null {
  const times = entries
    .filter((e) => e.date === date)
    .map((e) => minutesOfDay(e.loggedAt))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (times.length === 0) return null;
  return { first: times[0]!, last: times[times.length - 1]! };
}

export interface SlotProtein {
  slot: MealSlot;
  proteinG: number;
  /** True when this sitting clears the per-meal threshold. */
  hits: boolean;
}

export interface ProteinSpread {
  slots: SlotProtein[];
  totalG: number;
  /** Sittings at or over the threshold. */
  hitCount: number;
  thresholdG: number;
  /** The largest single slot as a share of the day, 0–1. */
  biggestShare: number;
}

/**
 * How the day's protein falls across the four slots.
 *
 * The threshold is a commonly cited figure for a dose that meaningfully
 * raises synthesis, and it is on screen as a line to clear rather than a rule
 * — plenty of people do very well eating twice a day.
 */
export function proteinSpread(
  entries: NutritionEntry[],
  date: ISODate,
  thresholdG = 30,
): ProteinSpread | null {
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const byslot = new Map<MealSlot, number>();
  for (const e of entries) {
    if (e.date !== date) continue;
    const grams = scaleMacros(e.macros, e.quantity).proteinG;
    byslot.set(e.slot, (byslot.get(e.slot) ?? 0) + grams);
  }
  if (byslot.size === 0) return null;

  const rows = slots
    .filter((s) => byslot.has(s))
    .map((slot) => {
      const proteinG = Math.round((byslot.get(slot) ?? 0) * 10) / 10;
      return { slot, proteinG, hits: proteinG >= thresholdG };
    });
  const totalG = Math.round(rows.reduce((a, r) => a + r.proteinG, 0) * 10) / 10;

  return {
    slots: rows,
    totalG,
    hitCount: rows.filter((r) => r.hits).length,
    thresholdG,
    biggestShare: totalG > 0 ? Math.max(...rows.map((r) => r.proteinG)) / totalG : 0,
  };
}

/** A line about how the protein is spread, or null when there is nothing to say. */
export function readSpread(spread: ProteinSpread | null): string | null {
  if (!spread || spread.totalG <= 0) return null;
  if (spread.slots.length === 1) {
    return `All ${Math.round(spread.totalG)}g of today's protein landed in one sitting.`;
  }
  if (spread.biggestShare > 0.6) {
    return `${Math.round(spread.biggestShare * 100)}% of today's protein is in a single meal. Spreading it out is easier on the appetite, if not necessarily on the muscle.`;
  }
  return `${spread.hitCount} of ${spread.slots.length} sittings cleared ${spread.thresholdG}g.`;
}

/** A line about the eating window. */
export function readWindow(typical: TypicalWindow | null): string | null {
  if (!typical) return null;
  return `You usually eat between ${formatClock(typical.firstMinutes)} and ${formatClock(typical.lastMinutes)} — a ${formatSpan(typical.windowMinutes)} window, across ${typical.days} logged days.`;
}

export const MEAL_TIMING_NOTE =
  'This reads when food was logged, not when it was eaten. Enter the whole day at bedtime and it will show a five-minute eating window, and there is no way for it to tell that apart from a real one. Meal timing also matters far less than what and how much — treat this as a habit mirror, not a lever.';
