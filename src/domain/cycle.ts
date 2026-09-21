import type { ISODate } from './types';
import { daysBetweenDates, todayISO } from './date';

/**
 * Menstrual cycle tracking.
 *
 * Two things shape everything here.
 *
 * The first is that predictions from a calendar are weak. The luteal phase is
 * fairly consistent within a person; the follicular phase is not, and it is
 * the one that moves when someone is ill, stressed, travelling or training
 * hard. So a prediction is only offered once there is enough history for it
 * to mean anything, it comes with the width of that person's own variation
 * rather than a single date, and it is never presented as a fact.
 *
 * The second is that this is emphatically not contraception and not a
 * diagnostic. Cycle apps have been used as both and people have been hurt by
 * it. The app says so plainly and the fertile-window language is deliberately
 * descriptive rather than advisory.
 */

export type Flow = 'spotting' | 'light' | 'medium' | 'heavy';

export const FLOW_LABEL: Record<Flow, string> = {
  spotting: 'Spotting',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
};

export type CycleSymptom =
  | 'cramps'
  | 'headache'
  | 'bloating'
  | 'tender_breasts'
  | 'fatigue'
  | 'low_mood'
  | 'acne'
  | 'cravings'
  | 'back_pain'
  | 'nausea';

export const SYMPTOM_LABEL: Record<CycleSymptom, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  tender_breasts: 'Tender breasts',
  fatigue: 'Fatigue',
  low_mood: 'Low mood',
  acne: 'Acne',
  cravings: 'Cravings',
  back_pain: 'Back pain',
  nausea: 'Nausea',
};

export interface CycleDay {
  date: ISODate;
  /** Absent on a day with no bleeding. */
  flow?: Flow;
  symptoms?: CycleSymptom[];
  note?: string;
}

export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export const PHASE_LABEL: Record<Phase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulatory: 'Ovulatory',
  luteal: 'Luteal',
};

/**
 * What each phase tends to involve, said carefully.
 *
 * Between-person variation here is enormous and the training research is
 * genuinely mixed — so these describe what is commonly reported rather than
 * telling anyone how to train, and the screen adds that their own log beats
 * any of it.
 */
export const PHASE_NOTE: Record<Phase, string> = {
  menstrual: 'Bleeding. Plenty of people train normally through it and plenty do not; both are ordinary.',
  follicular: 'Between the end of bleeding and ovulation. Often where people report feeling strongest, though the evidence for that is softer than the internet suggests.',
  ovulatory: 'Around ovulation, give or take a couple of days either side of any estimate.',
  luteal: 'After ovulation, before the next period. Commonly reported: more fatigue, more appetite, a slightly higher resting heart rate and body temperature.',
};

export interface CyclePeriod {
  start: ISODate;
  end: ISODate;
  /** Days of bleeding, counted rather than assumed from start and end. */
  days: number;
}

/**
 * Group logged bleeding days into periods.
 *
 * A gap of one day inside a period is normal and does not start a new one;
 * two clear days does. Without that tolerance, one light day mid-period
 * splits a single period into two and wrecks every cycle length after it.
 */
export function periodsFrom(days: CycleDay[]): CyclePeriod[] {
  const bleeding = days
    .filter((d) => d.flow)
    .map((d) => d.date)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (bleeding.length === 0) return [];

  const periods: CyclePeriod[] = [];
  let start = bleeding[0]!;
  let previous = bleeding[0]!;
  let count = 1;

  for (let i = 1; i < bleeding.length; i += 1) {
    const date = bleeding[i]!;
    const gap = daysBetweenDates(previous, date);
    if (gap <= 2) {
      previous = date;
      count += 1;
    } else {
      periods.push({ start, end: previous, days: count });
      start = date;
      previous = date;
      count = 1;
    }
  }
  periods.push({ start, end: previous, days: count });
  return periods;
}

export interface CycleStats {
  /** Completed cycles measured, start to start. */
  cycles: number;
  averageLength: number;
  shortest: number;
  longest: number;
  /** How much this person's cycles vary, in days. */
  variation: number;
  averagePeriodDays: number;
}

/** How many completed cycles before a prediction is worth making. */
export const MIN_CYCLES_FOR_PREDICTION = 2;

/**
 * Cycle lengths, measured start to start.
 *
 * Only completed cycles count: the gap between the last period and today is
 * not a cycle length, it is however far through one you are, and averaging it
 * in would drag every prediction earlier.
 */
export function cycleStats(periods: CyclePeriod[]): CycleStats | null {
  if (periods.length < 2) return null;

  const lengths: number[] = [];
  for (let i = 1; i < periods.length; i += 1) {
    const length = daysBetweenDates(periods[i - 1]!.start, periods[i]!.start);
    // A "cycle" outside this range is a logging gap or a double-entry, not a
    // cycle, and letting one in would move the average by a week.
    if (length >= 15 && length <= 60) lengths.push(length);
  }
  if (lengths.length === 0) return null;

  const average = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const periodDays = periods.map((p) => p.days);

  return {
    cycles: lengths.length,
    averageLength: Math.round(average),
    shortest: Math.min(...lengths),
    longest: Math.max(...lengths),
    variation: Math.round(Math.max(...lengths) - Math.min(...lengths)),
    averagePeriodDays: Math.round(periodDays.reduce((a, b) => a + b, 0) / periodDays.length),
  };
}

export interface CycleToday {
  /** Days since the current cycle started, 1-based. */
  day: number;
  phase: Phase;
  cycleStart: ISODate;
  /** Null until there is enough history to estimate a length. */
  expectedLength: number | null;
}

/**
 * Where today sits.
 *
 * The phase boundaries are anchored backwards from the *expected next period*
 * rather than forwards from the last one, because the luteal phase is the
 * consistent part. Anchoring forwards — "ovulation is day 14" — is the
 * assumption that makes calendar apps wrong for anyone whose cycle is not 28
 * days, which is most people.
 */
export function cycleToday(
  periods: CyclePeriod[],
  stats: CycleStats | null,
  today: ISODate = todayISO(),
): CycleToday | null {
  const current = [...periods].reverse().find((p) => p.start <= today);
  if (!current) return null;

  const day = daysBetweenDates(current.start, today) + 1;
  const expectedLength = stats ? stats.averageLength : null;
  const bleedingToday = today <= current.end;

  let phase: Phase;
  if (bleedingToday) {
    phase = 'menstrual';
  } else if (expectedLength == null) {
    // Without a measured length there is nothing to count back from, so the
    // honest answer is the broad one rather than an invented ovulation date.
    phase = day <= 14 ? 'follicular' : 'luteal';
  } else {
    // Luteal phase ~14 days; ovulation therefore ~14 days before the next
    // period, whatever this person's total length happens to be.
    const ovulation = expectedLength - 14;
    if (day < ovulation - 1) phase = 'follicular';
    else if (day <= ovulation + 1) phase = 'ovulatory';
    else phase = 'luteal';
  }

  return { day, phase, cycleStart: current.start, expectedLength };
}

export interface CyclePrediction {
  /** Most likely start of the next period. */
  expected: ISODate;
  /** The window their own variation implies. */
  earliest: ISODate;
  latest: ISODate;
  daysAway: number;
  note: string;
}

/**
 * When the next period is likely, as a window.
 *
 * A single date would be false precision: this is built from a handful of
 * previous cycles, and the width of the window is that person's own observed
 * spread rather than a constant. Refuses below two completed cycles.
 */
export function predictNext(
  periods: CyclePeriod[],
  stats: CycleStats | null,
  today: ISODate = todayISO(),
): CyclePrediction | null {
  if (!stats || stats.cycles < MIN_CYCLES_FOR_PREDICTION) return null;
  const last = periods[periods.length - 1];
  if (!last) return null;

  const expected = shift(last.start, stats.averageLength);
  // At least two days either side even for a metronome, because no cycle is
  // actually a metronome.
  const spread = Math.max(2, Math.ceil(stats.variation / 2));

  const daysAway = daysBetweenDates(today, expected);
  return {
    expected,
    earliest: shift(expected, -spread),
    latest: shift(expected, spread),
    daysAway,
    note:
      stats.variation >= 7
        ? `Your cycles have ranged ${stats.shortest} to ${stats.longest} days, so this is a wide guess rather than a date.`
        : `Based on ${stats.cycles} ${stats.cycles === 1 ? 'cycle' : 'cycles'} averaging ${stats.averageLength} days.`,
  };
}

/** Which symptoms show up most, and on which cycle days. */
export interface SymptomPattern {
  symptom: CycleSymptom;
  label: string;
  days: number;
  /** Median cycle day this shows up on, when there are enough to say. */
  typicalDay: number | null;
}

export function symptomPatterns(
  days: CycleDay[],
  periods: CyclePeriod[],
  minDays = 3,
): SymptomPattern[] {
  const counts = new Map<CycleSymptom, number[]>();

  for (const d of days) {
    if (!d.symptoms?.length) continue;
    const cycleStart = [...periods].reverse().find((p) => p.start <= d.date);
    const cycleDay = cycleStart ? daysBetweenDates(cycleStart.start, d.date) + 1 : null;
    for (const symptom of d.symptoms) {
      const list = counts.get(symptom) ?? [];
      if (cycleDay != null) list.push(cycleDay);
      counts.set(symptom, list);
    }
  }

  return [...counts.entries()]
    .map(([symptom, cycleDays]) => ({
      symptom,
      label: SYMPTOM_LABEL[symptom],
      days: cycleDays.length,
      typicalDay: cycleDays.length >= minDays ? median(cycleDays) : null,
    }))
    .filter((p) => p.days > 0)
    .sort((a, b) => b.days - a.days);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** The line at the top. */
export function readCycle(
  current: CycleToday | null,
  prediction: CyclePrediction | null,
  stats: CycleStats | null,
): string {
  if (!current) {
    return 'Log a day of bleeding and this starts tracking. Two full cycles in, it can start estimating.';
  }
  const where = `Day ${current.day}, ${PHASE_LABEL[current.phase].toLowerCase()} phase.`;
  if (!prediction) {
    const need = stats ? MIN_CYCLES_FOR_PREDICTION - stats.cycles : MIN_CYCLES_FOR_PREDICTION;
    return `${where} ${need > 0 ? `${need} more complete ${need === 1 ? 'cycle' : 'cycles'} and it can start estimating the next one.` : ''}`.trim();
  }
  if (prediction.daysAway < 0) {
    return `${where} Your estimate was ${Math.abs(prediction.daysAway)} days ago — late is common and usually nothing, but a doctor is the right place for a pattern of it.`;
  }
  return `${where} Next period estimated in about ${prediction.daysAway} ${prediction.daysAway === 1 ? 'day' : 'days'}.`;
}

function shift(date: ISODate, delta: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const CYCLE_CAVEAT =
  'Estimates from your own logged history, not measurements. Cycles move with illness, stress, travel and training, so a prediction is a rough window and nothing more. This is not contraception and must not be used as any part of it, and it cannot diagnose anything — cycles that are consistently very long, very short, very heavy or very painful are worth raising with a doctor rather than an app.';
