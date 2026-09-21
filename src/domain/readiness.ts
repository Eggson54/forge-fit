import type { ISODate, SessionEffort, SleepLog, Workout } from './types';
import { daysBetweenDates, todayISO } from './date';
import type { VolumeWeek } from './volumeTrend';

/**
 * A single reading of how ready the athlete is to train hard today.
 *
 * Every component is something the app already knows: last night's sleep, the
 * week's sleep against it, how hard the last session was, how many days have
 * run without a rest day, and this week's volume against the recent norm. No
 * heart rate, no HRV, no wearable — so the honest framing is "here is what
 * your own logs say", not "your body is at 72%".
 *
 * Two rules the rest of the file exists to keep:
 *
 *  1. A component the app cannot see is dropped and the remaining weights are
 *     renormalised. Scoring a missing input as zero would read as "you slept
 *     badly" when the truth is "you did not log it".
 *  2. With nothing known at all, this returns null. A readiness score on no
 *     data is a number with a confident shape and no content.
 */

export type ReadinessBand = 'low' | 'moderate' | 'good' | 'peak';

export const BAND_LABEL: Record<ReadinessBand, string> = {
  low: 'Run it light',
  moderate: 'Middling',
  good: 'Good to go',
  peak: 'Green light',
};

export const BAND_TINT: Record<ReadinessBand, string> = {
  low: '#FF7A3D',
  moderate: '#FFB020',
  good: '#C6F135',
  peak: '#39E6C3',
};

export type ComponentKey = 'sleep' | 'sleepTrend' | 'effort' | 'consecutive' | 'load' | 'hrv' | 'rhr';

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  sleep: 'Last night',
  sleepTrend: 'Sleep this week',
  effort: 'Last session',
  consecutive: 'Days on the trot',
  load: 'Volume vs normal',
  hrv: 'Heart rate variability',
  rhr: 'Resting heart rate',
};

/** How much each component moves the number, before renormalising. */
const WEIGHT: Record<ComponentKey, number> = {
  sleep: 0.32,
  sleepTrend: 0.16,
  effort: 0.2,
  consecutive: 0.16,
  load: 0.16,
  // The two measured signals outweigh everything inferred. A body reporting
  // an overnight HRV collapse knows something that "you trained three days in
  // a row" is only guessing at — and when they are absent the renormalising
  // hands their share back to the rest rather than leaving a hole.
  hrv: 0.34,
  rhr: 0.24,
};

export interface ReadinessInput {
  /** Minutes slept last night, or null when nothing was logged. */
  sleepMinutes: number | null;
  /** The athlete's own sleep target, in minutes. */
  sleepTargetMinutes: number;
  /** Trailing average, in minutes, excluding last night. */
  sleepAverageMinutes: number | null;
  /** How the last completed session felt, 1–5. */
  lastEffort: SessionEffort | null;
  /** Consecutive days trained, counting back from yesterday. */
  consecutiveDays: number | null;
  /**
   * This week's working sets against the recent weekly average. 1 is normal,
   * 1.5 is half again as much.
   */
  loadRatio: number | null;
  /**
   * How far today's HRV sits from the athlete's own baseline, in standard
   * deviations. Null without a wearable or without enough history.
   */
  hrvZ?: number | null;
  /** The same for resting heart rate. */
  rhrZ?: number | null;
}

export interface ReadinessComponent {
  key: ComponentKey;
  label: string;
  /** 0–1, where 1 is "nothing here is holding you back". */
  score: number;
  /** Share of the final number, after renormalising. */
  weight: number;
  note: string;
}

export interface Readiness {
  score: number;
  band: ReadinessBand;
  components: ReadinessComponent[];
  /** The one sentence worth reading. */
  headline: string;
}

export function readiness(input: ReadinessInput): Readiness | null {
  const parts: ReadinessComponent[] = [];

  if (input.sleepMinutes != null && input.sleepTargetMinutes > 0) {
    const ratio = input.sleepMinutes / input.sleepTargetMinutes;
    parts.push({
      key: 'sleep',
      label: COMPONENT_LABEL.sleep,
      // Sleeping past the target does not keep adding: the ninth hour is not
      // twice the tenth, and a scale that rewarded it would let one long lie-in
      // paper over a bad week.
      score: curve(ratio, 0.6, 1),
      weight: WEIGHT.sleep,
      note: sleepNote(input.sleepMinutes, input.sleepTargetMinutes),
    });
  }

  if (input.sleepAverageMinutes != null && input.sleepTargetMinutes > 0) {
    const ratio = input.sleepAverageMinutes / input.sleepTargetMinutes;
    parts.push({
      key: 'sleepTrend',
      label: COMPONENT_LABEL.sleepTrend,
      score: curve(ratio, 0.65, 1),
      weight: WEIGHT.sleepTrend,
      note: `Averaging ${hours(input.sleepAverageMinutes)} against ${article(hours(input.sleepTargetMinutes))} target.`,
    });
  }

  if (input.lastEffort != null) {
    // A 5 yesterday is a real cost; a 1 is barely a withdrawal.
    const score = [1, 1, 0.9, 0.72, 0.5, 0.32][input.lastEffort] ?? 0.7;
    parts.push({
      key: 'effort',
      label: COMPONENT_LABEL.effort,
      score,
      weight: WEIGHT.effort,
      note: EFFORT_NOTE[input.lastEffort],
    });
  }

  if (input.consecutiveDays != null) {
    parts.push({
      key: 'consecutive',
      label: COMPONENT_LABEL.consecutive,
      score: input.consecutiveDays <= 2 ? 1 : Math.max(0.25, 1 - (input.consecutiveDays - 2) * 0.18),
      weight: WEIGHT.consecutive,
      note:
        input.consecutiveDays === 0
          ? 'Rested yesterday.'
          : `${input.consecutiveDays} ${input.consecutiveDays === 1 ? 'day' : 'days'} in a row without a rest day.`,
    });
  }

  if (input.loadRatio != null) {
    // Both directions cost something: well over the norm is a spike, well
    // under is detraining rather than freshness.
    const over = Math.max(0, input.loadRatio - 1.15);
    const under = Math.max(0, 0.6 - input.loadRatio);
    parts.push({
      key: 'load',
      label: COMPONENT_LABEL.load,
      score: clamp01(1 - over * 1.2 - under * 0.6),
      weight: WEIGHT.load,
      note: loadNote(input.loadRatio),
    });
  }

  // HRV up is good and resting heart rate up is not, so the two signs are
  // handled separately rather than by a shared abs().
  if (input.hrvZ != null && Number.isFinite(input.hrvZ)) {
    parts.push({
      key: 'hrv',
      label: COMPONENT_LABEL.hrv,
      score: fromZ(input.hrvZ, true),
      weight: WEIGHT.hrv,
      note: zNote('HRV', input.hrvZ, true),
    });
  }
  if (input.rhrZ != null && Number.isFinite(input.rhrZ)) {
    parts.push({
      key: 'rhr',
      label: COMPONENT_LABEL.rhr,
      score: fromZ(input.rhrZ, false),
      weight: WEIGHT.rhr,
      note: zNote('Resting heart rate', input.rhrZ, false),
    });
  }

  if (parts.length === 0) return null;

  const total = parts.reduce((a, p) => a + p.weight, 0);
  const components = parts.map((p) => ({ ...p, weight: Math.round((p.weight / total) * 100) / 100 }));
  const score = Math.round(parts.reduce((a, p) => a + p.score * (p.weight / total), 0) * 100);
  const band = bandOf(score);

  return { score, band, components, headline: headlineFor(score, band, components) };
}

function bandOf(score: number): ReadinessBand {
  if (score < 45) return 'low';
  if (score < 65) return 'moderate';
  if (score < 82) return 'good';
  return 'peak';
}

/**
 * The line at the top.
 *
 * It names the weakest component rather than restating the number, because the
 * number is already on the screen an inch above and "72" says nothing about
 * what to do.
 */
function headlineFor(score: number, band: ReadinessBand, components: ReadinessComponent[]): string {
  const weakest = [...components].sort((a, b) => a.score - b.score)[0]!;
  if (band === 'peak') return 'Everything the app can see is green. Take the session you planned.';
  if (weakest.score > 0.85) return 'Nothing is dragging much. Train as planned.';
  const lead =
    band === 'low'
      ? 'Today is a day to take something off the bar.'
      : band === 'moderate'
        ? 'Middling. Train, but leave a rep in the tank.'
        : 'Mostly green.';
  return `${lead} ${weakest.note}`;
}

/**
 * A standard-deviation move turned into a 0-1 score.
 *
 * Being a long way the *good* way does not keep adding — an unusually high
 * HRV is a fine morning, not a licence to double the session, and a scale that
 * rewarded it would let one good night outvote everything else.
 */
function fromZ(z: number, higherIsBetter: boolean): number {
  const favourable = higherIsBetter ? z : -z;
  if (favourable >= 0) return Math.min(1, 0.85 + favourable * 0.1);
  return clamp01(0.85 + favourable * 0.3);
}

function zNote(label: string, z: number, higherIsBetter: boolean): string {
  const favourable = higherIsBetter ? z : -z;
  const size = Math.abs(z);
  if (size < 1) return `${label} is where it usually is.`;
  const direction = z > 0 ? 'above' : 'below';
  const strength = size >= 2 ? 'well' : 'a little';
  const tail = favourable >= 0 ? '' : ' Your body is still paying for something.';
  return `${label} is ${strength} ${direction} your own normal.${tail}`;
}

/** Ramp from `floor` to `top`, flat above it. */
function curve(ratio: number, floor: number, top: number): number {
  if (ratio >= top) return 1;
  if (ratio <= floor) return 0.15;
  return 0.15 + ((ratio - floor) / (top - floor)) * 0.85;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const EFFORT_NOTE: Record<SessionEffort, string> = {
  1: 'Last session was easy.',
  2: 'Last session was steady.',
  3: 'Last session was solid work.',
  4: 'Last session was hard — some of that is still owed.',
  5: 'Last session was all out, and that bill has not been paid yet.',
};

function sleepNote(minutes: number, target: number): string {
  const short = target - minutes;
  if (short <= 15) return `${hours(minutes)} — at or over your target.`;
  return `${hours(minutes)} last night, ${hours(short)} short of your target.`;
}

function loadNote(ratio: number): string {
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct < 15) return 'Volume is about where it usually sits.';
  if (ratio > 1) return `Volume is running ${pct}% above your recent normal.`;
  return `Volume is running ${pct}% below your recent normal.`;
}

/**
 * "a 7h target", "an 8h target".
 *
 * Spoken aloud these are numbers, so the article follows the sound of the
 * digits rather than the letter: eight, eleven and eighteen take "an", and
 * everything else in the range a sleep target occupies takes "a".
 */
function article(text: string): string {
  return /^(8|11|18)(?![0-9])/.test(text) ? `an ${text}` : `a ${text}`;
}

/** Minutes as "7h 20m", without Intl. */
export function hours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

/**
 * Consecutive days trained, counting back from yesterday.
 *
 * Deliberately excludes today: a session logged this morning does not make
 * this morning's readiness worse, and counting it would flip the number the
 * moment someone finished training.
 */
export function consecutiveTrainingDays(workouts: Workout[], today: ISODate = todayISO()): number {
  const days = new Set(workouts.map((w) => w.date));
  let n = 0;
  for (let back = 1; back <= 30; back += 1) {
    const date = shift(today, -back);
    if (!days.has(date)) break;
    n += 1;
  }
  return n;
}

function shift(date: ISODate, delta: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Average sleep over the window, ignoring last night and unlogged days. */
export function trailingSleepAverage(
  logs: SleepLog[],
  today: ISODate = todayISO(),
  windowDays = 7,
): number | null {
  const kept = logs.filter((l) => {
    const back = daysBetweenDates(l.date, today);
    return back >= 1 && back <= windowDays && l.minutes > 0;
  });
  if (kept.length === 0) return null;
  return Math.round(kept.reduce((a, l) => a + l.minutes, 0) / kept.length);
}

/**
 * This week's volume against the recent weekly norm.
 *
 * Projected to a full week before comparing, for the same reason the load
 * reading does it: three days of a week are not a week, and comparing a raw
 * Wednesday against finished weeks told everyone they were detraining.
 */
export function loadRatio(series: VolumeWeek[], daysElapsed: number): number | null {
  if (series.length < 2) return null;
  const current = series[series.length - 1]!;
  const prior = series.slice(0, -1).filter((w) => w.sets > 0);
  if (prior.length === 0) return null;
  const average = prior.reduce((a, w) => a + w.sets, 0) / prior.length;
  if (average <= 0) return null;

  const elapsed = Math.max(1, Math.min(7, Math.round(daysElapsed)));
  // A Monday morning with nothing logged is not detraining, and projecting
  // zero across the week said exactly that — it read "70% below your normal"
  // to everyone who had not trained yet that week.
  if (current.sets === 0 && elapsed <= 2) return null;

  const pace = (current.sets / elapsed) * 7;
  return Math.round((pace / average) * 100) / 100;
}

export const READINESS_CAVEAT =
  'Built from what you logged — sleep, how the last session felt, how many days you have strung together and how this week compares with your recent normal. There is no heart rate or HRV behind it, and it cannot see illness, stress or a bad night it was not told about. Treat it as a prompt to check in with yourself, not a verdict, and never as medical advice.';
