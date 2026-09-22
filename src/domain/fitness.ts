import type { ISODate } from './types';
import { addDaysISO, daysBetweenDates, todayISO } from './date';

/**
 * Fitness, fatigue and form — the three curves that come out of a training
 * load series.
 *
 * The model is the old impulse-response one: fitness is a slow exponential
 * average of daily load, fatigue is a fast one, and form is the gap between
 * them. It is forty years old, it is not physiology, and it is wrong in ways
 * that matter — it knows nothing about sleep, illness, or whether a session
 * was intervals or a jog of the same "load".
 *
 * It is here anyway because the *shape* is genuinely useful: it shows when
 * you have been climbing for weeks, and it shows the hole you dig by doing
 * too much in one of them. What the app must not do is present it as a
 * verdict, which is why every reading below comes with what it cannot see.
 */

/** Days of half-life for the slow curve. Six weeks of training history. */
export const FITNESS_DAYS = 42;
/** The fast curve. A week of accumulated tiredness. */
export const FATIGUE_DAYS = 7;

export interface LoadDay {
  date: ISODate;
  /** Whatever the app's own effort unit is. Zero on a rest day. */
  load: number;
}

export interface FitnessPoint {
  date: ISODate;
  fitness: number;
  fatigue: number;
  /** Fitness minus fatigue. Negative means carrying more than you have built. */
  form: number;
  load: number;
}

/**
 * Run the model forward over a continuous run of days.
 *
 * Gaps are filled with zero-load days rather than skipped, which is the whole
 * point: a fortnight off should show fitness decaying, and a series that
 * silently omits the empty days shows it holding flat instead.
 */
export function fitnessSeries(
  days: LoadDay[],
  opts: { from?: ISODate; to?: ISODate } = {},
): FitnessPoint[] {
  if (days.length === 0) return [];

  const byDate = new Map(days.map((d) => [d.date, d.load]));
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const from = opts.from ?? sorted[0]!.date;
  const to = opts.to ?? todayISO();
  const span = daysBetweenDates(from, to);
  if (span < 0) return [];

  const fitnessAlpha = 1 - Math.exp(-1 / FITNESS_DAYS);
  const fatigueAlpha = 1 - Math.exp(-1 / FATIGUE_DAYS);

  let fitness = 0;
  let fatigue = 0;
  const out: FitnessPoint[] = [];

  for (let i = 0; i <= span; i++) {
    const date = addDaysISO(from, i);
    const load = byDate.get(date) ?? 0;
    fitness = fitness + (load - fitness) * fitnessAlpha;
    fatigue = fatigue + (load - fatigue) * fatigueAlpha;
    out.push({
      date,
      fitness: Math.round(fitness * 10) / 10,
      fatigue: Math.round(fatigue * 10) / 10,
      form: Math.round((fitness - fatigue) * 10) / 10,
      load,
    });
  }

  return out;
}

export type FormBand = 'fresh' | 'neutral' | 'productive' | 'overreaching';

export const FORM_LABEL: Record<FormBand, string> = {
  fresh: 'Fresh',
  neutral: 'Steady',
  productive: 'Building',
  overreaching: 'Digging deep',
};

/**
 * Bands on form, as a fraction of current fitness rather than as raw numbers.
 *
 * A form of −20 means something very different to someone whose fitness is 30
 * than to someone whose fitness is 120. Absolute thresholds are the most
 * common way this model is misapplied.
 */
export function formBand(point: FitnessPoint): FormBand {
  const base = Math.max(1, point.fitness);
  const ratio = point.form / base;
  if (ratio > 0.1) return 'fresh';
  if (ratio > -0.1) return 'neutral';
  if (ratio > -0.35) return 'productive';
  return 'overreaching';
}

export interface FitnessReading {
  current: FitnessPoint;
  band: FormBand;
  /** Change in fitness over the last 28 days. */
  fitnessChange: number;
  headline: string;
  detail: string;
  caveat: string;
}

export function readFitness(series: FitnessPoint[]): FitnessReading | null {
  // Under three weeks the curves are still filling from zero and read as a
  // dramatic rise no matter what was done. Better to show nothing.
  if (series.length < 21) return null;

  const current = series[series.length - 1]!;
  const monthAgo = series[Math.max(0, series.length - 29)]!;
  const fitnessChange = Math.round((current.fitness - monthAgo.fitness) * 10) / 10;
  const band = formBand(current);

  return {
    current,
    band,
    fitnessChange,
    headline: `${FORM_LABEL[band]} · fitness ${Math.round(current.fitness)}`,
    detail: describe(band, fitnessChange),
    caveat:
      'This model knows only what you logged. It cannot see a bad night, a cold, or a week of standing up all day, and it treats an hour of intervals and an hour of jogging as the same hour if they scored the same.',
  };
}

function describe(band: FormBand, change: number): string {
  const direction =
    change > 1 ? `Fitness is up ${change} over four weeks.`
    : change < -1 ? `Fitness is down ${Math.abs(change)} over four weeks.`
    : 'Fitness is holding where it was a month ago.';

  const state: Record<FormBand, string> = {
    fresh: 'You are carrying less fatigue than fitness — rested, and a good place to race from. Held for weeks, it is also what detraining looks like.',
    neutral: 'Fatigue and fitness are roughly in balance. Nothing to correct.',
    productive: 'More fatigue than fitness, which is where training actually happens — provided it is a phase and not a habit.',
    overreaching: 'Fatigue is well past fitness. This is the territory where people get ill or hurt; if it has been a while, that is the signal.',
  };

  return `${direction} ${state[band]}`;
}

/** The load number an activity contributes. Higher is harder, longer or both. */
export interface LoadInput {
  minutes: number;
  /** 1-5, or null when nobody rated it. */
  effort: number | null;
  /** Average heart rate as a fraction of maximum, when there is one. */
  hrFraction?: number | null;
}

/**
 * One activity's contribution to load.
 *
 * Heart rate wins when it exists, because it measures what the session did to
 * the athlete rather than what the athlete thought of it. Without it, rated
 * effort squared — doubling intensity is far more than twice the cost, and a
 * linear scale flatters easy volume.
 */
export function loadOf(input: LoadInput): number {
  const minutes = Math.max(0, input.minutes);
  if (minutes === 0) return 0;

  if (typeof input.hrFraction === 'number' && input.hrFraction > 0) {
    // Relative to a fraction of 0.7, which is roughly steady aerobic work.
    const intensity = Math.max(0.4, Math.min(1.1, input.hrFraction));
    return Math.round(minutes * Math.pow(intensity / 0.7, 2) * 1.2);
  }

  const effort = input.effort ?? 3;
  return Math.round(minutes * Math.pow(effort / 3, 2) * 1.2);
}

export const FITNESS_CAVEAT =
  'Fitness and fatigue here are exponential averages of the load you logged — a forty-year-old model that is useful for its shape and misleading when read as a number. It has no idea how you slept.';
