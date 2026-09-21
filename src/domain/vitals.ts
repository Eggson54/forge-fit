import type { ISODate } from './types';
import { daysBetweenDates, todayISO } from './date';

/**
 * The passive health signals — resting heart rate, HRV, respiratory rate,
 * wrist temperature, blood oxygen.
 *
 * These are only useful against *your own* baseline. Published normal ranges
 * for HRV span an order of magnitude between two healthy people of the same
 * age, so "your HRV is 42ms" is close to meaningless while "your HRV is 30%
 * below your own 30-day average, for the third night running" is worth
 * noticing. Everything here is therefore relative, and nothing is reported at
 * all until there is enough history to have a baseline.
 *
 * None of it is diagnostic. A deviation means look at your week, not call a
 * doctor — and the screen says that.
 */

export type VitalKey =
  | 'restingHeartRate'
  | 'hrvMs'
  | 'respiratoryRate'
  | 'wristTemperatureC'
  | 'oxygenSaturationPct';

export const VITAL_LABEL: Record<VitalKey, string> = {
  restingHeartRate: 'Resting heart rate',
  hrvMs: 'Heart rate variability',
  respiratoryRate: 'Respiratory rate',
  wristTemperatureC: 'Wrist temperature',
  oxygenSaturationPct: 'Blood oxygen',
};

export const VITAL_UNIT: Record<VitalKey, string> = {
  restingHeartRate: 'bpm',
  hrvMs: 'ms',
  respiratoryRate: 'br/min',
  wristTemperatureC: '°C',
  oxygenSaturationPct: '%',
};

/**
 * Which direction is the good one.
 *
 * HRV up is good; resting heart rate up is not. Getting this backwards would
 * paint a bad night green, so it is a table rather than a guess at the call
 * site.
 */
export const VITAL_HIGHER_IS_BETTER: Record<VitalKey, boolean> = {
  restingHeartRate: false,
  hrvMs: true,
  respiratoryRate: false,
  wristTemperatureC: false,
  oxygenSaturationPct: true,
};

/** How many decimals the number deserves on screen. */
export const VITAL_DECIMALS: Record<VitalKey, number> = {
  restingHeartRate: 0,
  hrvMs: 0,
  respiratoryRate: 1,
  wristTemperatureC: 2,
  oxygenSaturationPct: 1,
};

export const VITAL_KEYS: VitalKey[] = [
  'restingHeartRate',
  'hrvMs',
  'respiratoryRate',
  'wristTemperatureC',
  'oxygenSaturationPct',
];

export interface VitalsDay {
  date: ISODate;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  respiratoryRate?: number | null;
  wristTemperatureC?: number | null;
  oxygenSaturationPct?: number | null;
  activeEnergyKcal?: number | null;
  /**
   * Where the numbers came from, so a manual entry is never mistaken for a
   * sensor reading and sample data is never mistaken for either.
   */
  source: 'health' | 'manual' | 'demo';
}

/** Days with a value for this key, oldest first. */
export function seriesFor(days: VitalsDay[], key: VitalKey): { date: ISODate; value: number }[] {
  return days
    .filter((d) => typeof d[key] === 'number' && Number.isFinite(d[key] as number))
    .map((d) => ({ date: d.date, value: d[key] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface Baseline {
  mean: number;
  /** Standard deviation, the width of "normal for you". */
  sd: number;
  days: number;
}

/** How many days of history before a baseline means anything. */
export const MIN_BASELINE_DAYS = 7;

/**
 * The athlete's own normal for a signal, over a trailing window.
 *
 * Excludes today on purpose: comparing today against a window that contains
 * today drags the baseline toward whatever today did, which is exactly the
 * thing being measured.
 */
export function baselineFor(
  days: VitalsDay[],
  key: VitalKey,
  opts: { today?: ISODate; windowDays?: number } = {},
): Baseline | null {
  const today = opts.today ?? todayISO();
  const windowDays = opts.windowDays ?? 30;

  const values = seriesFor(days, key)
    .filter((p) => {
      const back = daysBetweenDates(p.date, today);
      return back >= 1 && back <= windowDays;
    })
    .map((p) => p.value);

  if (values.length < MIN_BASELINE_DAYS) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance), days: values.length };
}

export type Deviation = 'normal' | 'slightly_off' | 'off';

export interface VitalReading {
  key: VitalKey;
  label: string;
  unit: string;
  value: number;
  baseline: Baseline;
  /** Difference from the baseline, in the signal's own units. */
  delta: number;
  /** Difference in standard deviations. The comparable number. */
  z: number;
  deviation: Deviation;
  /** True when the move is in the direction you would want. */
  favourable: boolean;
  note: string;
}

/**
 * Today's reading against the baseline.
 *
 * A standard deviation is the unit here because it is the only one that
 * compares across signals: two beats of resting heart rate and two
 * milliseconds of HRV are wildly different amounts of unusual.
 */
export function readVital(
  days: VitalsDay[],
  key: VitalKey,
  opts: { today?: ISODate; windowDays?: number } = {},
): VitalReading | null {
  const today = opts.today ?? todayISO();
  const series = seriesFor(days, key);
  const latest = series.filter((p) => p.date <= today).pop();
  if (!latest) return null;

  const baseline = baselineFor(days, key, { today, windowDays: opts.windowDays });
  if (!baseline) return null;

  const delta = latest.value - baseline.mean;
  // A signal that barely moves has an SD near zero, and dividing by it sends
  // every z to infinity — one bpm would read as a crisis. But treating a flat
  // signal as "nothing can ever be unusual" is just as wrong, and a device
  // that reports the same number nine days running is reporting its own
  // precision rather than a body that does not vary. So the scale has a floor
  // of 2% of the signal's own size: sd wins whenever it is real, and a flat
  // baseline still notices a move that is large relative to the number.
  const scale = Math.max(baseline.sd, Math.abs(baseline.mean) * 0.02);
  const z = scale > 0 ? delta / scale : 0;
  const magnitude = Math.abs(z);
  const deviation: Deviation = magnitude >= 2 ? 'off' : magnitude >= 1 ? 'slightly_off' : 'normal';
  const favourable = delta === 0 ? true : delta > 0 === VITAL_HIGHER_IS_BETTER[key];

  return {
    key,
    label: VITAL_LABEL[key],
    unit: VITAL_UNIT[key],
    value: latest.value,
    baseline,
    delta: round(delta, VITAL_DECIMALS[key] + 1),
    z: Math.round(z * 100) / 100,
    deviation,
    favourable,
    note: noteFor(key, delta, deviation, favourable, baseline),
  };
}

function noteFor(
  key: VitalKey,
  delta: number,
  deviation: Deviation,
  favourable: boolean,
  baseline: Baseline,
): string {
  const unit = VITAL_UNIT[key];
  const decimals = VITAL_DECIMALS[key];
  const size = `${Math.abs(round(delta, decimals + 1)).toFixed(decimals)}${unit === '%' ? '' : ' '}${unit}`;
  const usual = `your ${baseline.days}-day normal of ${baseline.mean.toFixed(decimals)}${unit === '%' ? '' : ' '}${unit}`;

  if (deviation === 'normal') return `In line with ${usual}.`;
  const direction = delta > 0 ? 'above' : 'below';
  const strength = deviation === 'off' ? 'Well' : 'A little';
  const tail = favourable ? '' : ' Worth a look at your week.';
  return `${strength} ${direction} ${usual} — ${size} ${direction}.${tail}`;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Every signal that has enough history, most unusual first. */
export function readAllVitals(
  days: VitalsDay[],
  opts: { today?: ISODate; windowDays?: number } = {},
): VitalReading[] {
  return VITAL_KEYS.map((k) => readVital(days, k, opts))
    .filter((r): r is VitalReading => r !== null)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/**
 * One line for the top of the health monitor.
 *
 * Says nothing rather than something reassuring when there is no history:
 * "all normal" off two days of data is a claim the app cannot support.
 */
export function readMonitor(readings: VitalReading[]): string | null {
  if (readings.length === 0) return null;

  const unfavourable = readings.filter((r) => !r.favourable && r.deviation !== 'normal');
  if (unfavourable.length === 0) {
    const moved = readings.filter((r) => r.deviation !== 'normal');
    if (moved.length === 0) return 'Everything is sitting where it usually sits.';
    return `${moved.map((r) => r.label.toLowerCase()).join(' and ')} moved, and in the direction you would want.`;
  }

  const worst = unfavourable[0]!;
  if (unfavourable.length === 1) {
    return `${worst.label} is ${worst.deviation === 'off' ? 'well' : 'a little'} outside your normal. One signal on its own is usually nothing.`;
  }
  return `${unfavourable.length} signals are outside your normal, ${worst.label.toLowerCase()} most of all. Several at once more often means a hard week, a short night, or something coming on.`;
}

/**
 * A month of plausible signals, for the browser preview where no real device
 * can be read.
 *
 * Deterministic — a seeded wobble rather than Math.random — so the screen looks
 * the same on every reload and a screenshot means something. Always stored
 * under the `demo` connection state, which the app refuses to call connected.
 */
export function demoVitals(today: ISODate, days = 30): VitalsDay[] {
  const out: VitalsDay[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    // Two out-of-phase sines: a weekly rhythm and a slower one, so the series
    // has the shape of a real trend instead of noise around a flat line.
    const w = Math.sin((back / 7) * Math.PI * 2);
    const slow = Math.sin((back / 23) * Math.PI * 2);
    // The last two days run hot: a short night and a hard session, so the
    // monitor has something to actually say.
    const strainedDays = back <= 1 ? 1 : 0;

    out.push({
      date: shiftDate(today, -back),
      restingHeartRate: Math.round(54 + w * 1.6 + slow * 1.2 + strainedDays * 6),
      hrvMs: Math.round(58 + w * 5 + slow * 4 - strainedDays * 18),
      respiratoryRate: Math.round((14.2 + w * 0.4 + strainedDays * 1.1) * 10) / 10,
      wristTemperatureC: Math.round((36.4 + w * 0.08 + strainedDays * 0.32) * 100) / 100,
      oxygenSaturationPct: Math.round((97.4 + w * 0.4) * 10) / 10,
      activeEnergyKcal: Math.round(520 + w * 110 + slow * 60),
      source: 'demo',
    });
  }
  return out;
}

function shiftDate(date: ISODate, delta: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export const VITALS_CAVEAT =
  'These are compared against your own baseline, not a published normal range — between two healthy people the same age, HRV can differ by a factor of ten, so only your own trend means anything. Nothing here is a diagnosis or a medical measurement, and a single unusual night is usually just a night. If something worries you, or keeps up, talk to a doctor rather than an app.';
