import type { ISODate, NutritionEntry, WeightLog } from './types';
import { addDaysISO, daysBetweenDates, todayISO } from './date';
import { calorieFloor, scaleMacros } from './nutrition';

/**
 * Maintenance calories measured from what actually happened, rather than
 * predicted from a formula.
 *
 * Mifflin-St Jeor guesses a number from height, weight, age and a coarse
 * activity multiplier, and for any individual it can be a few hundred calories
 * out in either direction — the multiplier is the weak link, because "moderate"
 * covers an enormous range of real lives. Once someone has logged their intake
 * and weighed in for a few weeks, the data answers the question directly: the
 * weight trend is the balance sheet, and average intake minus the energy that
 * trend represents is maintenance.
 *
 * Everything here is descriptive. It reports what the numbers did; it does not
 * tell anyone what to eat.
 */

/** Energy per kilogram of bodyweight change. The usual figure for fat tissue. */
export const KCAL_PER_KG = 7700;

export interface EnergyDay {
  date: ISODate;
  calories: number;
}

/**
 * Calories per day, for days that have at least one entry.
 *
 * Days with nothing logged are absent rather than zero. A zero would be a
 * claim the user did not eat, and averaging it in would drag maintenance down
 * by hundreds of calories — the single most dangerous way this calculation can
 * go wrong.
 */
export function dailyCalories(entries: NutritionEntry[]): EnergyDay[] {
  const byDate = new Map<ISODate, number>();
  for (const e of entries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + scaleMacros(e.macros, e.quantity).calories);
  }
  return [...byDate.entries()]
    .map(([date, calories]) => ({ date, calories: Math.round(calories) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface WeightTrend {
  /** Least-squares slope, kilograms per day. */
  kgPerDay: number;
  kgPerWeek: number;
  readings: number;
  firstDate: ISODate;
  lastDate: ISODate;
  spanDays: number;
}

/**
 * The slope of a run of weigh-ins, by least squares.
 *
 * First-versus-last would be simpler and much worse: bodyweight swings a
 * kilogram or more on water alone, so two endpoint readings can invent or erase
 * a whole week of progress. A regression over every point lets the noise cancel.
 */
export function weightTrend(weights: WeightLog[]): WeightTrend | null {
  const byDate = new Map<ISODate, number>();
  // One reading per day; the last one entered for that date wins.
  for (const w of weights) if (w.weightKg > 0) byDate.set(w.date, w.weightKg);
  const points = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (points.length < 2) return null;

  const firstDate = points[0]![0];
  const lastDate = points[points.length - 1]![0];
  const xs = points.map((p) => daysBetweenDates(firstDate, p[0]));
  const ys = points.map((p) => p[1]);

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;

  const kgPerDay = num / den;
  if (!Number.isFinite(kgPerDay)) return null;

  return {
    kgPerDay,
    kgPerWeek: Math.round(kgPerDay * 7 * 100) / 100,
    readings: n,
    firstDate,
    lastDate,
    spanDays: daysBetweenDates(firstDate, lastDate),
  };
}

export type EnergyConfidence = 'low' | 'fair' | 'good';

export interface TdeeEstimate {
  /** Observed maintenance, kcal/day. */
  kcal: number;
  meanIntake: number;
  daysLogged: number;
  trend: WeightTrend;
  confidence: EnergyConfidence;
  windowDays: number;
}

/** What the calculation still needs before it can say anything. */
export interface EnergyGap {
  needDaysLogged: number;
  needWeighIns: number;
  needSpanDays: number;
  haveDaysLogged: number;
  haveWeighIns: number;
  haveSpanDays: number;
}

const MIN_DAYS_LOGGED = 10;
const MIN_WEIGH_INS = 3;
const MIN_SPAN_DAYS = 14;

export interface TdeeOptions {
  /** How far back to look. Four weeks is long enough to outrun water noise. */
  windowDays?: number;
  today?: ISODate;
}

/**
 * Observed maintenance, or null when there is not enough logged to say.
 *
 * Refusing is the important half. A fortnight of half-logged days and two
 * weigh-ins can produce a confident-looking number that is a thousand calories
 * wrong, and a wrong maintenance figure is worse than none — people eat to it.
 */
export function observedTdee(
  entries: NutritionEntry[],
  weights: WeightLog[],
  opts: TdeeOptions = {},
): TdeeEstimate | null {
  const windowDays = opts.windowDays ?? 28;
  const { days, trend } = withinWindow(entries, weights, windowDays, opts.today);
  if (!trend) return null;
  if (days.length < MIN_DAYS_LOGGED) return null;
  if (trend.readings < MIN_WEIGH_INS || trend.spanDays < MIN_SPAN_DAYS) return null;

  const meanIntake = days.reduce((a, d) => a + d.calories, 0) / days.length;
  const kcal = meanIntake - trend.kgPerDay * KCAL_PER_KG;
  // Outside this range the inputs are wrong, not the person. A day of logging
  // that double-counted a meal, or a weigh-in entered in pounds, lands here.
  if (!Number.isFinite(kcal) || kcal < 1000 || kcal > 6000) return null;

  return {
    kcal: Math.round(kcal / 10) * 10,
    meanIntake: Math.round(meanIntake),
    daysLogged: days.length,
    trend,
    confidence: confidenceOf(days.length, trend),
    windowDays,
  };
}

/** How far the inputs are from producing an estimate. */
export function energyGap(
  entries: NutritionEntry[],
  weights: WeightLog[],
  opts: TdeeOptions = {},
): EnergyGap {
  const windowDays = opts.windowDays ?? 28;
  const { days, trend } = withinWindow(entries, weights, windowDays, opts.today);
  return {
    needDaysLogged: MIN_DAYS_LOGGED,
    needWeighIns: MIN_WEIGH_INS,
    needSpanDays: MIN_SPAN_DAYS,
    haveDaysLogged: days.length,
    haveWeighIns: trend?.readings ?? countWeighIns(weights, windowDays, opts.today),
    haveSpanDays: trend?.spanDays ?? 0,
  };
}

function withinWindow(
  entries: NutritionEntry[],
  weights: WeightLog[],
  windowDays: number,
  today?: ISODate,
) {
  const end = today ?? todayISO();
  const start = addDaysISO(end, -(windowDays - 1));
  const inRange = (date: ISODate) => date >= start && date <= end;
  const days = dailyCalories(entries.filter((e) => inRange(e.date))).filter((d) => d.calories > 0);
  const trend = weightTrend(weights.filter((w) => inRange(w.date)));
  return { days, trend };
}

function countWeighIns(weights: WeightLog[], windowDays: number, today?: ISODate): number {
  const end = today ?? todayISO();
  const start = addDaysISO(end, -(windowDays - 1));
  return new Set(weights.filter((w) => w.date >= start && w.date <= end).map((w) => w.date)).size;
}

function confidenceOf(daysLogged: number, trend: WeightTrend): EnergyConfidence {
  if (daysLogged >= 21 && trend.readings >= 8 && trend.spanDays >= 21) return 'good';
  if (daysLogged >= 14 && trend.readings >= 5) return 'fair';
  return 'low';
}

export const CONFIDENCE_LABEL: Record<EnergyConfidence, string> = {
  low: 'Rough',
  fair: 'Fair',
  good: 'Solid',
};

export const CONFIDENCE_BLURB: Record<EnergyConfidence, string> = {
  low: 'Barely enough to calculate. Treat it as a first draft and keep logging.',
  fair: 'Enough to work from. A few more weigh-ins will tighten it.',
  good: 'Weeks of logging behind this one. It beats any formula.',
};

/** Daily intake that produces a given rate of change, at a given maintenance. */
export function intakeForRate(tdeeKcal: number, kgPerWeek: number): number {
  return Math.round((tdeeKcal + (kgPerWeek * KCAL_PER_KG) / 7) / 10) * 10;
}

/** The rate a given daily intake implies, at a given maintenance. */
export function rateForIntake(tdeeKcal: number, intakeKcal: number): number {
  return Math.round(((intakeKcal - tdeeKcal) * 7 / KCAL_PER_KG) * 100) / 100;
}

/** Weeks to cover a weight gap at a rate, or null when the rate goes nowhere. */
export function weeksToGoal(currentKg: number, goalKg: number, kgPerWeek: number): number | null {
  const gap = goalKg - currentKg;
  if (Math.abs(gap) < 0.1) return 0;
  if (kgPerWeek === 0) return null;
  // Moving the wrong way never arrives.
  if (Math.sign(gap) !== Math.sign(kgPerWeek)) return null;
  return Math.round((gap / kgPerWeek) * 10) / 10;
}

export interface FormulaGap {
  deltaKcal: number;
  /** Percentage of the formula figure, signed. */
  pct: number;
  verdict: 'close' | 'higher' | 'lower';
}

/**
 * How the measured figure compares with the predicted one.
 *
 * Within 5% is called close, because at that distance the difference is inside
 * the error of logging itself and reading anything into it is noise.
 */
export function formulaGap(observedKcal: number, formulaKcal: number): FormulaGap | null {
  if (!formulaKcal || formulaKcal <= 0) return null;
  const deltaKcal = Math.round(observedKcal - formulaKcal);
  const pct = Math.round((deltaKcal / formulaKcal) * 1000) / 10;
  return { deltaKcal, pct, verdict: Math.abs(pct) < 5 ? 'close' : deltaKcal > 0 ? 'higher' : 'lower' };
}

/** The floor the app will not recommend below, shared with the targets builder. */
export { calorieFloor };

/**
 * A rate commonly described as sustainable: about 1% of bodyweight a week
 * losing, and a quarter of that gaining. Used to shade a slider, not to tell
 * anyone what to do.
 */
export function usualRateRange(bodyweightKg: number): { minKgPerWeek: number; maxKgPerWeek: number } {
  const one = Math.round(bodyweightKg * 0.01 * 100) / 100;
  return { minKgPerWeek: -one, maxKgPerWeek: Math.round(one * 0.25 * 100) / 100 };
}

export const ENERGY_CAVEAT =
  'This reads your own logs: average intake against the slope of your weigh-ins. It is only as good as the logging behind it, and the first week or two of any change is mostly water and glycogen rather than tissue. It is a description of what happened, not a prescription — for medical or clinical nutrition advice, talk to a professional.';
