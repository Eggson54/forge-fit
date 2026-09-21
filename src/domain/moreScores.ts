import type { ISODate, SleepLog } from './types';
import { daysBetweenDates } from './date';
import type { CardioSession, CardioType } from './cardio';
import type { VitalsDay } from './vitals';
import { baselineFor } from './vitals';
import type { BodyFatPoint } from './bodyFat';

/**
 * The remaining readings: stress, conditioning mix, heart-rate recovery,
 * body-composition projections and how much sleep this person actually needs.
 *
 * Each one refuses rather than guesses, and each says what it cannot see. The
 * stress score in particular is the one most likely to be over-read, so it is
 * built only from things that genuinely respond to strain and it says out
 * loud that it cannot tell a hard week from a hard fortnight at work.
 */

// -------------------------------------------------------------- stress ----

export interface StressInput {
  /** How far today's HRV sits from this person's own baseline, in SDs. */
  hrvZ: number | null;
  /** The same for resting heart rate. */
  rhrZ: number | null;
  /** Their own 1-5 rating from the journal, if they gave one. */
  reported: number | null;
  /** Last night's sleep against their target, as a ratio. */
  sleepRatio: number | null;
}

export interface StressReading {
  /** 0 calm, 100 maximally strained. */
  score: number;
  band: 'low' | 'moderate' | 'elevated' | 'high';
  parts: { label: string; contribution: number; note: string }[];
  headline: string;
}

const STRESS_BANDS: { min: number; band: StressReading['band'] }[] = [
  { min: 75, band: 'high' },
  { min: 55, band: 'elevated' },
  { min: 32, band: 'moderate' },
  { min: 0, band: 'low' },
];

/**
 * A strain reading from the signals that actually move with it.
 *
 * Suppressed HRV, an elevated resting heart rate, short sleep and the
 * person's own rating. Everything missing is dropped and the rest is
 * renormalised, and with nothing at all it returns null — an app that always
 * has a stress number is an app that made one up.
 */
export function stressScore(input: StressInput): StressReading | null {
  const parts: { label: string; contribution: number; weight: number; note: string }[] = [];

  if (input.hrvZ != null && Number.isFinite(input.hrvZ)) {
    // HRV *down* is the strained direction, so the sign flips.
    const strain = clamp01(-input.hrvZ / 2.5);
    parts.push({
      label: 'HRV',
      contribution: strain,
      weight: 0.36,
      note: input.hrvZ < -1 ? 'Well below your own normal.' : 'Around your own normal.',
    });
  }
  if (input.rhrZ != null && Number.isFinite(input.rhrZ)) {
    const strain = clamp01(input.rhrZ / 2.5);
    parts.push({
      label: 'Resting heart rate',
      contribution: strain,
      weight: 0.26,
      note: input.rhrZ > 1 ? 'Running above your own normal.' : 'Around your own normal.',
    });
  }
  if (input.sleepRatio != null && input.sleepRatio > 0) {
    const strain = clamp01((1 - input.sleepRatio) / 0.4);
    parts.push({
      label: 'Sleep',
      contribution: strain,
      weight: 0.22,
      note: input.sleepRatio < 0.85 ? 'Short of your target.' : 'About what you aim for.',
    });
  }
  if (input.reported != null && input.reported > 0) {
    parts.push({
      label: 'How you rated it',
      contribution: clamp01((input.reported - 1) / 4),
      weight: 0.16,
      note: `You said ${input.reported} out of 5.`,
    });
  }

  if (parts.length === 0) return null;

  const total = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.contribution * p.weight, 0) / total) * 100);
  const band = STRESS_BANDS.find((b) => score >= b.min)!.band;
  const worst = [...parts].sort((a, b) => b.contribution - a.contribution)[0]!;

  return {
    score,
    band,
    parts: parts.map((p) => ({ label: p.label, contribution: Math.round(p.contribution * 100) / 100, note: p.note })),
    // The "cannot tell them apart" clause belongs on both branches. A caveat
    // that only shows up when the number is high is a caveat people learn to
    // read as an alarm rather than as a limit of the measurement.
    headline:
      band === 'low'
        ? 'Nothing the app can see is under strain today. It cannot tell training strain from life strain either way — it only sees the body\u2019s answer to both.'
        : `${worst.label} is the biggest contributor. This cannot tell training strain from life strain — it only sees the body\u2019s answer to both.`,
  };
}

// ------------------------------------------------------- cardio focus ----

export type CardioFocus = 'base' | 'mixed' | 'intensity' | 'none';

export interface CardioFocusReading {
  focus: CardioFocus;
  easyMinutes: number;
  hardMinutes: number;
  /** Share of conditioning minutes done easy, 0-1. */
  easyShare: number;
  note: string;
}

/**
 * Whether the conditioning has been mostly easy or mostly hard.
 *
 * Split by session type rather than by heart rate, because heart rate is not
 * something this app reliably has: walks, easy rides and steady swims count
 * as base work; runs, rows and anything explicitly hard count as intensity.
 * Crude, and labelled as crude — but the 80/20 split it is checking for is
 * real and most people miss it in the same direction.
 */
const EASY_KINDS: CardioType[] = ['walk', 'hike', 'elliptical'];

export function cardioFocus(sessions: CardioSession[], today: ISODate, days = 28): CardioFocusReading {
  const window = sessions.filter((s) => {
    const back = daysBetweenDates(s.date, today);
    return back >= 0 && back < days;
  });

  let easy = 0;
  let hard = 0;
  for (const s of window) {
    if (EASY_KINDS.includes(s.type)) easy += s.minutes;
    else hard += s.minutes;
  }
  const total = easy + hard;
  if (total === 0) {
    return { focus: 'none', easyMinutes: 0, hardMinutes: 0, easyShare: 0, note: 'No conditioning logged in the last four weeks.' };
  }

  const easyShare = easy / total;
  const focus: CardioFocus = easyShare >= 0.7 ? 'base' : easyShare <= 0.35 ? 'intensity' : 'mixed';

  const NOTE: Record<Exclude<CardioFocus, 'none'>, string> = {
    base: `${Math.round(easyShare * 100)}% of your conditioning minutes were easy work. That is the shape most endurance plans aim for.`,
    mixed: `${Math.round(easyShare * 100)}% easy, the rest harder. A reasonable middle.`,
    intensity: `Only ${Math.round(easyShare * 100)}% of your conditioning was easy. Most plans put far more of it there, though a short block of mostly-hard work is a real choice.`,
  };

  return {
    focus,
    easyMinutes: Math.round(easy),
    hardMinutes: Math.round(hard),
    easyShare: Math.round(easyShare * 100) / 100,
    note: `${NOTE[focus]} Split by session type, not heart rate — the app cannot see how hard a given walk actually was.`,
  };
}

// --------------------------------------------- heart rate recovery ----

export interface HeartRateRecovery {
  /** Beats the resting rate has come down since the recent peak. */
  drop: number;
  from: number;
  to: number;
  days: number;
  note: string;
}

/**
 * How far resting heart rate has come down from its recent high.
 *
 * Not the clinical one-minute-after-exercise measure — the app has no way to
 * take that — so it is named for what it is: the recovery of resting heart
 * rate across a training block. Refuses without a baseline's worth of days.
 */
export function heartRateRecovery(
  days: VitalsDay[],
  today: ISODate,
  windowDays = 28,
): HeartRateRecovery | null {
  const baseline = baselineFor(days, 'restingHeartRate', { today, windowDays });
  if (!baseline) return null;

  const series = days
    .filter((d) => typeof d.restingHeartRate === 'number')
    .filter((d) => {
      const back = daysBetweenDates(d.date, today);
      return back >= 0 && back <= windowDays;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (series.length < 7) return null;

  const peak = Math.max(...series.map((d) => d.restingHeartRate as number));
  const latest = series[series.length - 1]!.restingHeartRate as number;
  const drop = Math.round((peak - latest) * 10) / 10;

  return {
    drop,
    from: peak,
    to: latest,
    days: series.length,
    note:
      drop <= 0
        ? 'Resting heart rate is at its highest point of the window. That happens in a hard block and on the way into an illness alike.'
        : `Down ${drop} bpm from this window's high of ${peak}. This is resting heart rate across a block, not the one-minute-after-exercise measure — the app cannot take that one.`,
  };
}

// ------------------------------------------------------- projections ----

export interface Projection {
  /** Where the value lands at the horizon, if the trend holds. */
  value: number;
  horizonDays: number;
  perWeek: number;
  note: string;
}

/**
 * Extend a body-composition trend forwards.
 *
 * Refuses below three readings across at least three weeks, caps the horizon
 * at ninety days, and caps the rate: a body-fat percentage does not fall two
 * points a week however convincingly two measurements say it did.
 */
export function projectComposition(
  series: { date: ISODate; value: number }[],
  opts: { horizonDays?: number; maxPerWeek?: number; label: string; unit: string },
): Projection | null {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length < 3) return null;

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanDays = daysBetweenDates(first.date, last.date);
  if (spanDays < 21) return null;

  const perDay = (last.value - first.value) / spanDays;
  const maxPerWeek = opts.maxPerWeek ?? 0.5;
  const cappedPerDay = Math.max(-maxPerWeek / 7, Math.min(maxPerWeek / 7, perDay));
  const horizon = Math.min(90, opts.horizonDays ?? 30);
  const value = Math.round((last.value + cappedPerDay * horizon) * 10) / 10;
  const perWeek = Math.round(cappedPerDay * 7 * 100) / 100;

  return {
    value,
    horizonDays: horizon,
    perWeek,
    note:
      Math.abs(perWeek) < 0.05
        ? `${opts.label} is holding steady across ${sorted.length} readings.`
        : `At ${Math.abs(perWeek)} ${opts.unit} a week, ${opts.label.toLowerCase()} lands near ${value} ${opts.unit} in ${horizon} days — if the trend holds, which it rarely does exactly.`,
  };
}

/** Body-fat percentage forwards, from the same series the composition screen plots. */
export function projectBodyFat(points: BodyFatPoint[], horizonDays = 30): Projection | null {
  return projectComposition(
    points.map((p) => ({ date: p.date, value: p.pct })),
    { horizonDays, maxPerWeek: 0.5, label: 'Body fat', unit: '%' },
  );
}

// ------------------------------------------------------ sleep needs ----

export interface SleepNeed {
  /** The target this person's own data supports, in minutes. */
  suggested: number;
  current: number;
  /** Nights behind the suggestion. */
  nights: number;
  note: string;
}

/**
 * How much sleep this person actually seems to need.
 *
 * Taken as the amount they get on their *unconstrained* nights — the longest
 * quarter of the last month, which are the nights nothing cut short. That is
 * a far better estimate of need than an average, which mostly measures
 * alarms. Refuses below twelve nights.
 */
export function sleepNeed(logs: SleepLog[], today: ISODate, currentTarget: number): SleepNeed | null {
  const nights = logs
    .filter((l) => {
      const back = daysBetweenDates(l.date, today);
      return back >= 0 && back <= 30 && l.minutes > 0;
    })
    .map((l) => l.minutes)
    .sort((a, b) => b - a);
  if (nights.length < 12) return null;

  const topQuarter = nights.slice(0, Math.max(3, Math.round(nights.length / 4)));
  const suggested = Math.round(topQuarter.reduce((a, b) => a + b, 0) / topQuarter.length / 5) * 5;
  const difference = suggested - currentTarget;

  return {
    suggested,
    current: currentTarget,
    nights: nights.length,
    note:
      Math.abs(difference) <= 15
        ? 'Your target matches what you sleep when nothing cuts the night short.'
        : difference > 0
          ? `On nights nothing woke you, you sleep about ${fmt(suggested)} — ${fmt(difference)} more than your target. That is usually closer to what a body actually wants.`
          : `On your longest nights you sleep about ${fmt(suggested)}, under your ${fmt(currentTarget)} target. Either the target is ambitious or something is cutting every night short.`,
  };
}

function fmt(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const MORE_SCORES_CAVEAT =
  'Stress here is the body’s answer to strain of every kind — training, work, illness, a bad night — and it cannot tell them apart. Heart-rate recovery is measured across a training block, not the minute after a session. Projections extend a trend and cap the rate, because bodies do not move as fast as two measurements sometimes suggest.';
