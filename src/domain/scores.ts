import type { ISODate, SessionEffort, SleepLog, Targets, Workout } from './types';
import { daysBetweenDates, todayISO } from './date';
import { isWarmupSet } from './sets';
import { groupThousands } from './units';
import type { CardioSession } from './cardio';

/**
 * The daily scores.
 *
 * Every one of these is an index, not a measurement: a number invented to make
 * a handful of real numbers comparable across days. That is a genuinely useful
 * thing to do and also the easiest place in a fitness app to start lying, so
 * three rules hold throughout:
 *
 *  - Nothing is scored from data that is not there. A missing input returns
 *    null, not a middling number, because a 50 nobody earned reads exactly
 *    like a 50 somebody did.
 *  - Every score carries the components it was built from, so the screen can
 *    show its working rather than an oracle's verdict.
 *  - Scales are anchored to the athlete's own targets and history wherever a
 *    population figure would be arbitrary.
 */

export interface ScoreBand {
  min: number;
  label: string;
  tint: string;
}

/** Shared 0-100 bands, so a 72 means the same thing on every card. */
export const SCORE_BANDS: ScoreBand[] = [
  { min: 85, label: 'Excellent', tint: '#39E6C3' },
  { min: 70, label: 'Good', tint: '#C6F135' },
  { min: 50, label: 'Fair', tint: '#FFB020' },
  { min: 0, label: 'Poor', tint: '#FF7A3D' },
];

export function bandFor(score: number): ScoreBand {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
}

export interface ScorePart {
  label: string;
  /** 0-1 before weighting. */
  score: number;
  weight: number;
  note: string;
}

export interface Score {
  value: number;
  band: ScoreBand;
  parts: ScorePart[];
  headline: string;
}

/** Weighted mean of the parts, renormalised, as a 0-100 whole number. */
function combine(parts: ScorePart[]): number {
  const total = parts.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  return Math.round((parts.reduce((a, p) => a + p.score * p.weight, 0) / total) * 100);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------- sleep ----

export interface SleepInput {
  minutes: number | null;
  targetMinutes: number;
  /** 1-5, if the user rated it. */
  quality?: number | null;
  /** The nights before, for consistency. */
  recentMinutes: number[];
}

/**
 * Sleep score: duration against the athlete's own target, how steady the week
 * has been, and their own rating if they gave one.
 *
 * Consistency is in here on purpose. Seven hours every night and a week
 * alternating five and nine average the same and are not the same, and the
 * duration term alone cannot tell them apart.
 */
export function sleepScore(input: SleepInput): Score | null {
  if (input.minutes == null || input.minutes <= 0 || input.targetMinutes <= 0) return null;

  const parts: ScorePart[] = [];

  const ratio = input.minutes / input.targetMinutes;
  parts.push({
    label: 'Duration',
    // Past the target this stops climbing: the tenth hour is not worth twice
    // the ninth, and a scale that said so would reward a lie-in over a week.
    score: ratio >= 1 ? 1 : clamp01(0.1 + ((ratio - 0.5) / 0.5) * 0.9),
    weight: 0.6,
    note: `${formatHours(input.minutes)} against a ${formatHours(input.targetMinutes)} target.`,
  });

  if (input.recentMinutes.length >= 3) {
    const mean = input.recentMinutes.reduce((a, b) => a + b, 0) / input.recentMinutes.length;
    const spread =
      Math.sqrt(input.recentMinutes.reduce((a, b) => a + (b - mean) ** 2, 0) / input.recentMinutes.length);
    // An hour of night-to-night swing is a lot; ninety minutes is chaos.
    parts.push({
      label: 'Consistency',
      score: clamp01(1 - spread / 90),
      weight: 0.25,
      note:
        spread < 30
          ? 'Your nights are landing in roughly the same place.'
          : `Your nights swing by about ${Math.round(spread)} minutes either side.`,
    });
  }

  if (input.quality != null && input.quality > 0) {
    parts.push({
      label: 'How it felt',
      score: clamp01((input.quality - 1) / 4),
      weight: 0.15,
      note: `You rated it ${input.quality} out of 5.`,
    });
  }

  const value = combine(parts);
  const band = bandFor(value);
  const short = input.targetMinutes - input.minutes;
  const headline =
    short <= 15
      ? 'You hit your own sleep target.'
      : `${formatHours(short)} short of your target. ${parts.length > 1 ? parts[1]!.note : ''}`.trim();

  return { value, band, parts, headline };
}

// --------------------------------------------------------------- strain ----

export interface StrainInput {
  workouts: Workout[];
  cardio: CardioSession[];
  date: ISODate;
  /** Average daily strain over the trailing window, for the target. */
  baselineStrain?: number | null;
}

/**
 * Strain: how much was asked of the body today, on a 0-21 scale.
 *
 * The scale is 0-21 rather than 0-100 because it is logarithmic — the
 * difference between 18 and 19 is a far bigger day than between 8 and 9 — and
 * a 0-100 scale invites people to read it linearly. It is built from working
 * sets, session effort and cardio minutes, which are what this app actually
 * knows; an app with a chest strap would build it from heart rate instead and
 * get a better number.
 */
export const MAX_STRAIN = 21;

export interface Strain {
  value: number;
  /** The raw load, before the curve. Useful for trends. */
  rawLoad: number;
  parts: ScorePart[];
  headline: string;
}

export function strainFor(input: StrainInput): Strain {
  const day = input.workouts.filter((w) => w.date === input.date);
  const cardioToday = input.cardio.filter((c) => c.date === input.date);

  let sets = 0;
  let effortLoad = 0;
  for (const w of day) {
    const working = w.exercises.reduce(
      (a, ex) => a + ex.sets.filter((s) => s.completed && !isWarmupSet(s)).length,
      0,
    );
    sets += working;
    // Effort multiplies rather than adds: twenty sets at an RPE of 2 is not
    // the same day as twenty at a 5, and an additive term would say it was.
    effortLoad += working * EFFORT_WEIGHT[w.effort ?? 3];
  }

  const cardioMinutes = cardioToday.reduce((a, c) => a + c.minutes, 0);
  const rawLoad = effortLoad + cardioMinutes * 0.55;

  // A logarithmic curve, so an ordinary session lands in the middle and a
  // genuinely huge day approaches the ceiling without ever reaching it.
  const value = rawLoad <= 0 ? 0 : Math.round(Math.min(MAX_STRAIN, Math.log1p(rawLoad / 3) * 5.2) * 10) / 10;

  const parts: ScorePart[] = [];
  if (sets > 0) {
    parts.push({
      label: 'Lifting',
      score: clamp01(effortLoad / 60),
      weight: 0.7,
      note: `${sets} working ${sets === 1 ? 'set' : 'sets'}${day.some((w) => w.effort) ? `, effort ${day.map((w) => w.effort).filter(Boolean).join(' and ')}` : ''}.`,
    });
  }
  if (cardioMinutes > 0) {
    parts.push({
      label: 'Conditioning',
      score: clamp01(cardioMinutes / 90),
      weight: 0.3,
      note: `${Math.round(cardioMinutes)} minutes.`,
    });
  }

  return { value, rawLoad, parts, headline: strainHeadline(value, input.baselineStrain ?? null) };
}

const EFFORT_WEIGHT: Record<SessionEffort, number> = { 1: 0.5, 2: 0.75, 3: 1, 4: 1.35, 5: 1.7 };

function strainHeadline(value: number, baseline: number | null): string {
  if (value <= 0) return 'Nothing logged today. A rest day counts as a day.';
  if (baseline == null || baseline <= 0) {
    return `A ${describeStrain(value)} day. A few more and this gets compared against your own normal.`;
  }
  const delta = value - baseline;
  if (Math.abs(delta) < 1.5) return `A ${describeStrain(value)} day — about your usual.`;
  return `A ${describeStrain(value)} day, ${delta > 0 ? 'above' : 'below'} your usual ${baseline.toFixed(1)}.`;
}

function describeStrain(value: number): string {
  if (value >= 17) return 'very hard';
  if (value >= 13) return 'hard';
  if (value >= 8) return 'moderate';
  return 'light';
}

/** The strain an athlete usually accumulates in a day, over a trailing window. */
export function baselineStrain(
  workouts: Workout[],
  cardio: CardioSession[],
  today: ISODate = todayISO(),
  windowDays = 14,
): number | null {
  const values: number[] = [];
  for (let back = 1; back <= windowDays; back += 1) {
    const date = shift(today, -back);
    values.push(strainFor({ workouts, cardio, date }).value);
  }
  const trained = values.filter((v) => v > 0);
  // Averaging in rest days would drag the "usual" toward zero and make every
  // session look like an overreach.
  if (trained.length < 3) return null;
  return Math.round((trained.reduce((a, b) => a + b, 0) / trained.length) * 10) / 10;
}

/**
 * How much strain today can carry, given how recovered the athlete is.
 *
 * Deliberately a range rather than a number, and deliberately anchored to
 * their own baseline: "aim for 14.2" is false precision about something this
 * app measures indirectly.
 */
export function targetStrain(
  recoveryScore: number | null,
  baseline: number | null,
): { low: number; high: number } | null {
  if (baseline == null || baseline <= 0) return null;
  const factor = recoveryScore == null ? 1 : 0.6 + (recoveryScore / 100) * 0.7;
  const centre = baseline * factor;
  return {
    low: Math.round(Math.max(0, centre - 1.5) * 10) / 10,
    high: Math.round(Math.min(MAX_STRAIN, centre + 1.5) * 10) / 10,
  };
}

// ---------------------------------------------------------- cardio load ----

/**
 * Cardio load: conditioning minutes over the last week against the four weeks
 * behind it — the acute:chronic idea, in the plainest form the data supports.
 *
 * Needs four weeks of history before it says anything. A ratio computed from a
 * fortnight is a ratio of noise.
 */
export interface CardioLoad {
  acuteMinutes: number;
  chronicWeeklyMinutes: number;
  ratio: number;
  verdict: 'detraining' | 'steady' | 'building' | 'spiking';
  note: string;
}

export function cardioLoad(
  sessions: CardioSession[],
  today: ISODate = todayISO(),
): CardioLoad | null {
  const minutesIn = (from: number, to: number) =>
    sessions
      .filter((c) => {
        const back = daysBetweenDates(c.date, today);
        return back >= from && back < to;
      })
      .reduce((a, c) => a + c.minutes, 0);

  const acute = minutesIn(0, 7);
  const chronicTotal = minutesIn(7, 35);
  // Four weeks behind the current one. Without them there is no "normal" to
  // compare against and the honest answer is nothing at all.
  if (chronicTotal <= 0) return null;
  const chronicWeekly = chronicTotal / 4;
  const ratio = Math.round((acute / chronicWeekly) * 100) / 100;

  const verdict: CardioLoad['verdict'] =
    ratio >= 1.5 ? 'spiking' : ratio >= 1.15 ? 'building' : ratio >= 0.8 ? 'steady' : 'detraining';

  const NOTE: Record<CardioLoad['verdict'], string> = {
    spiking: 'This week is well above what you have been doing. That is where conditioning injuries come from.',
    building: 'Building on what you have been doing, at a rate that usually holds.',
    steady: 'About the same as your recent weeks.',
    detraining: 'Well below your recent weeks. Fine if it is deliberate.',
  };

  return {
    acuteMinutes: Math.round(acute),
    chronicWeeklyMinutes: Math.round(chronicWeekly),
    ratio,
    verdict,
    note: NOTE[verdict],
  };
}

// --------------------------------------------------------- energy bank ----

/**
 * Energy bank: calories in against calories out, today.
 *
 * "Out" is maintenance plus what was actively burned. Both are estimates and
 * the screen says so — this is a running balance to steer by, not an
 * accounting statement.
 */
export interface EnergyBank {
  inKcal: number;
  maintenanceKcal: number;
  activeKcal: number;
  balance: number;
  note: string;
}

export function energyBank(input: {
  consumedKcal: number;
  maintenanceKcal: number;
  activeKcal: number | null;
  targetKcal: number;
}): EnergyBank | null {
  if (input.maintenanceKcal <= 0) return null;
  const active = input.activeKcal ?? 0;
  const out = input.maintenanceKcal + active;
  const balance = Math.round(input.consumedKcal - out);
  const vsTarget = Math.round(input.consumedKcal - input.targetKcal);

  const note =
    Math.abs(vsTarget) <= 75
      ? 'Sitting on your target for the day.'
      : vsTarget < 0
        ? `${Math.abs(vsTarget)} kcal under your target so far.`
        : `${vsTarget} kcal over your target.`;

  return {
    inKcal: Math.round(input.consumedKcal),
    maintenanceKcal: Math.round(input.maintenanceKcal),
    activeKcal: Math.round(active),
    balance,
    note,
  };
}

// ----------------------------------------------------------- nutrition ----

/**
 * Nutrition score: how close the day came to the athlete's own targets.
 *
 * Calories are scored as a two-sided distance — a thousand under is not a
 * better day than a thousand over — while protein and fibre are one-sided,
 * because nobody has ever come to harm from clearing their protein target.
 */
export function nutritionScore(input: {
  calories: number;
  proteinG: number;
  fiberG: number | null;
  waterOz: number;
  targets: Targets;
  /**
   * True when the day is still running. A day scored at two in the afternoon
   * is mostly a measure of how much of it has happened, and calling that
   * "Poor" is the app misreading a clock as a verdict.
   */
  dayInProgress?: boolean;
}): Score | null {
  if (input.targets.calories <= 0) return null;
  // A day with nothing logged is not a zero-scoring day, it is an unlogged
  // day, and scoring it would punish people for the app's blind spots.
  if (input.calories <= 0 && input.proteinG <= 0) return null;

  const parts: ScorePart[] = [];

  const calorieMiss = Math.abs(input.calories - input.targets.calories) / input.targets.calories;
  parts.push({
    label: 'Calories',
    score: clamp01(1 - calorieMiss / 0.35),
    weight: 0.35,
    note:
      calorieMiss < 0.05
        ? 'On target.'
        : `${groupThousands(Math.round(Math.abs(input.calories - input.targets.calories)))} kcal ${input.calories > input.targets.calories ? 'over' : 'under'}.`,
  });

  parts.push({
    label: 'Protein',
    score: clamp01(input.proteinG / Math.max(1, input.targets.proteinG)),
    weight: 0.35,
    note: `${Math.round(input.proteinG)}g of ${input.targets.proteinG}g.`,
  });

  if (input.fiberG != null) {
    parts.push({
      label: 'Fibre',
      score: clamp01(input.fiberG / 30),
      weight: 0.15,
      note: `${Math.round(input.fiberG)}g. Thirty is the usual figure.`,
    });
  }

  parts.push({
    label: 'Water',
    score: clamp01(input.waterOz / Math.max(1, input.targets.waterOz)),
    weight: 0.15,
    note: `${Math.round(input.waterOz)} of ${input.targets.waterOz} oz.`,
  });

  const value = combine(parts);
  const weakest = [...parts].sort((a, b) => a.score - b.score)[0]!;

  const headline = input.dayInProgress
    ? `Still today — the furthest to go is ${weakest.label.toLowerCase()}, ${weakest.note.toLowerCase()}`
    : weakest.score > 0.9
      ? 'Every target met or close to it.'
      : `Biggest gap: ${weakest.label.toLowerCase()} — ${weakest.note.toLowerCase()}`;

  return { value, band: bandFor(value), parts, headline };
}

/**
 * Whether a day should still be treated as running.
 *
 * Eight in the evening, because by then most people have eaten what they are
 * going to eat, and scoring before that is scoring the clock.
 */
export function dayStillRunning(date: ISODate, today: ISODate, now: Date = new Date()): boolean {
  return date === today && now.getHours() < 20;
}

// ------------------------------------------------------------- helpers ----

export function formatHours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

/** Recent nights' sleep, most recent first, excluding the one being scored. */
export function recentNights(logs: SleepLog[], today: ISODate, nights = 7): number[] {
  return logs
    .filter((l) => {
      const back = daysBetweenDates(l.date, today);
      return back >= 1 && back <= nights && l.minutes > 0;
    })
    .map((l) => l.minutes);
}

function shift(date: ISODate, delta: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const SCORES_CAVEAT =
  'These are indexes, not measurements — numbers invented to make a handful of real ones comparable day to day. Strain is built from your sets, your effort rating and your conditioning minutes, not from heart rate, so it reads a hard set of squats better than it reads a stressful morning. Nothing here is a medical assessment.';
