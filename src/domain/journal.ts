import type { ISODate } from './types';
import { daysBetweenDates } from './date';

/**
 * The daily journal, and what it correlates with.
 *
 * The logging half is easy. The interesting half is the second one: given
 * "alcohol last night" and "how you slept", can the app say anything? Usually
 * not, and the whole design here is about being willing to say so.
 *
 * Three guards, because a correlation screen is the easiest place in a health
 * app to manufacture a finding:
 *
 *  1. A minimum number of paired days, and a minimum number in *each* group —
 *     nineteen dry nights and one heavy one is not a comparison.
 *  2. A minimum effect size. With enough days something always correlates
 *     with something, and reporting a two-minute difference in sleep as an
 *     insight is noise with a headline.
 *  3. The word "cause" never appears. People who drink late also eat late,
 *     sleep less and train less, and this cannot separate any of that.
 */

export type FactorKind = 'toggle' | 'count' | 'scale';

export interface FactorDef {
  key: string;
  label: string;
  kind: FactorKind;
  /** For counts: what one unit is. */
  unit?: string;
  /** Shown under the control. */
  hint?: string;
  /** Built in, so it cannot be deleted. */
  builtIn: boolean;
}

export const BUILT_IN_FACTORS: FactorDef[] = [
  { key: 'alcohol', label: 'Alcohol', kind: 'count', unit: 'drinks', hint: 'Standard drinks, last night.', builtIn: true },
  { key: 'sunlight', label: 'Daylight', kind: 'count', unit: 'min', hint: 'Time outside, roughly.', builtIn: true },
  { key: 'screenBeforeBed', label: 'Screen before bed', kind: 'count', unit: 'min', hint: 'Between getting into bed and sleeping.', builtIn: true },
  { key: 'caffeineAfterNoon', label: 'Caffeine after noon', kind: 'toggle', hint: 'Coffee, tea, anything with it in.', builtIn: true },
  { key: 'stress', label: 'Stress', kind: 'scale', hint: '1 calm, 5 frazzled.', builtIn: true },
  { key: 'mood', label: 'Mood', kind: 'scale', hint: '1 low, 5 great.', builtIn: true },
  { key: 'soreness', label: 'Soreness', kind: 'scale', hint: '1 fresh, 5 wrecked.', builtIn: true },
  { key: 'lateMeal', label: 'Ate late', kind: 'toggle', hint: 'Within two hours of bed.', builtIn: true },
];

export interface JournalEntry {
  date: ISODate;
  /** Factor key to value. Toggles are 0 or 1, scales 1-5, counts whatever. */
  values: Record<string, number>;
  note?: string;
}

export function factorByKey(key: string, custom: FactorDef[] = []): FactorDef | null {
  return [...BUILT_IN_FACTORS, ...custom].find((f) => f.key === key) ?? null;
}

/** Entries within the window, oldest first. */
export function entriesInWindow(
  entries: JournalEntry[],
  today: ISODate,
  windowDays = 60,
): JournalEntry[] {
  return entries
    .filter((e) => {
      const back = daysBetweenDates(e.date, today);
      return back >= 0 && back <= windowDays;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** How many days running someone has written something. */
export function journalStreak(entries: JournalEntry[], today: ISODate): number {
  const dates = new Set(entries.map((e) => e.date));
  let n = 0;
  for (let back = 0; back < 400; back += 1) {
    const date = shift(today, -back);
    if (!dates.has(date)) {
      // Today not being logged yet is not a broken streak at breakfast.
      if (back === 0) continue;
      break;
    }
    n += 1;
  }
  return n;
}

// ------------------------------------------------------------ outcomes ----

export interface Outcome {
  key: string;
  label: string;
  /** Day to value, for whatever the athlete is being compared on. */
  byDate: Record<ISODate, number>;
  unit: string;
  /** True when a bigger number is the better one. */
  higherIsBetter: boolean;
  /**
   * The smallest difference in this outcome worth reporting, in its own
   * units. Required, because the alternative — scaling the threshold to the
   * data's own spread — passes every time the factor explains most of the
   * variance, which is exactly when the numbers look most convincing and are
   * least worth trusting. Fifteen minutes of sleep; four points of a score.
   */
  minEffect: number;
}

export interface Correlation {
  factorKey: string;
  factorLabel: string;
  outcomeKey: string;
  outcomeLabel: string;
  outcomeUnit: string;
  /** Days where both the factor and the outcome are known. */
  pairs: number;
  /** Mean outcome on days the factor was present or high. */
  withMean: number;
  /** Mean outcome on the other days. */
  withoutMean: number;
  difference: number;
  /** Days in the smaller of the two groups. The honesty limit. */
  smallerGroup: number;
  favourable: boolean;
  note: string;
}

/** Below these, the app says nothing rather than something. */
export const MIN_PAIRS = 12;
export const MIN_GROUP = 4;

/**
 * Compare an outcome on days a factor was present against days it was not.
 *
 * Counts and scales are split at their own median rather than at a fixed
 * number: "more caffeine than usual for you" is a comparison that means
 * something, where "more than 200mg" is a number pulled out of the air.
 */
export function correlate(
  entries: JournalEntry[],
  factor: FactorDef,
  outcome: Outcome,
  opts: { minEffect?: number } = {},
): Correlation | null {
  const paired = entries
    .map((e) => ({ value: e.values[factor.key], out: outcome.byDate[e.date] }))
    .filter((p): p is { value: number; out: number } =>
      typeof p.value === 'number' && Number.isFinite(p.value) &&
      typeof p.out === 'number' && Number.isFinite(p.out));

  if (paired.length < MIN_PAIRS) return null;

  const threshold = factor.kind === 'toggle' ? 0.5 : medianOf(paired.map((p) => p.value));
  const withGroup = paired.filter((p) => p.value > threshold).map((p) => p.out);
  const withoutGroup = paired.filter((p) => p.value <= threshold).map((p) => p.out);

  // Nineteen dry nights and one heavy one is not a comparison.
  const smaller = Math.min(withGroup.length, withoutGroup.length);
  if (smaller < MIN_GROUP) return null;

  const withMean = mean(withGroup);
  const withoutMean = mean(withoutGroup);
  const difference = withMean - withoutMean;

  // Two thresholds, and the difference has to clear both. The absolute one
  // stops a technically-real one-minute difference being announced; the
  // relative one stops a fifteen-minute difference being announced when this
  // person's sleep swings by two hours anyway.
  const absolute = opts.minEffect ?? outcome.minEffect;
  const relative = spread(paired.map((p) => p.out)) * 0.4;
  if (Math.abs(difference) < Math.max(absolute, relative)) return null;

  const favourable = difference > 0 === outcome.higherIsBetter;

  return {
    factorKey: factor.key,
    factorLabel: factor.label,
    outcomeKey: outcome.key,
    outcomeLabel: outcome.label,
    outcomeUnit: outcome.unit,
    pairs: paired.length,
    withMean: round1(withMean),
    withoutMean: round1(withoutMean),
    difference: round1(difference),
    smallerGroup: smaller,
    favourable,
    note: noteFor(factor, outcome, difference, paired.length),
  };
}

function noteFor(factor: FactorDef, outcome: Outcome, difference: number, pairs: number): string {
  const more = factor.kind === 'toggle' ? `on days with ${factor.label.toLowerCase()}` : `on your higher ${factor.label.toLowerCase()} days`;
  const direction = difference > 0 ? 'higher' : 'lower';
  const size = `${Math.abs(round1(difference))}${outcome.unit === '%' ? '' : ' '}${outcome.unit}`;
  // Deliberately "goes with", never "causes". People who drink late also eat
  // late, sleep less and train less, and none of that is separable here.
  return `Your ${outcome.label.toLowerCase()} runs ${size} ${direction} ${more}, across ${pairs} days. That is a pattern, not a cause.`;
}

/** Every correlation worth showing, strongest first. */
export function findCorrelations(
  entries: JournalEntry[],
  factors: FactorDef[],
  outcomes: Outcome[],
): Correlation[] {
  const out: Correlation[] = [];
  for (const factor of factors) {
    for (const outcome of outcomes) {
      const c = correlate(entries, factor, outcome);
      if (c) out.push(c);
    }
  }
  return out.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

/** The line at the top of the journal. */
export function readJournal(
  correlations: Correlation[],
  entries: JournalEntry[],
): string {
  if (entries.length === 0) {
    return 'Nothing written yet. A fortnight of even two or three factors is enough for patterns to start showing.';
  }
  if (correlations.length === 0) {
    return `${entries.length} ${entries.length === 1 ? 'day' : 'days'} logged and nothing stands out yet — which is a real answer, not a missing one. Patterns need both enough days and a big enough difference.`;
  }
  const worst = correlations.find((c) => !c.favourable);
  if (worst) return worst.note;
  return correlations[0]!.note;
}

// ------------------------------------------------------------- helpers ----

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function spread(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, values.length));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function shift(date: ISODate, delta: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const JOURNAL_CAVEAT =
  'These are patterns in your own logging, not causes. Days you drink late are usually also days you eat late, sleep less and train differently, and nothing here can separate those. Treat a finding as something to test deliberately for a fortnight, not as a fact about your body.';
