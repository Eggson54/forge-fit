import type { Sex } from './types';

/**
 * A fitness age — an index that turns a handful of health markers into the
 * one unit everybody already understands.
 *
 * Two things have to be said before any of the arithmetic.
 *
 * First, this is not a measurement of biological ageing. Real biological-age
 * research uses DNA methylation clocks and panels of blood biomarkers; what a
 * phone and a watch can see is resting heart rate, heart-rate variability, a
 * VO₂ max estimate, sleep, body composition and how much someone moves. Those
 * genuinely track health, and reading them as "your body is running like a
 * 34-year-old's" is a useful way to feel the size of a change. It is not a
 * clinical result and the screen says so in those words.
 *
 * Second, every marker is scored against what is *expected at your
 * chronological age*, not against a young adult. Otherwise the number would
 * just be age again with noise on top, and every 60-year-old would be told
 * they are 60.
 *
 * Everything missing is dropped rather than guessed, and the confidence level
 * is reported alongside the number — a fitness age from two markers deserves
 * to be read differently from one built on six.
 */

export type MarkerKey = 'restingHeartRate' | 'hrv' | 'vo2max' | 'sleep' | 'bodyFat' | 'activity';

export const MARKER_LABEL: Record<MarkerKey, string> = {
  restingHeartRate: 'Resting heart rate',
  hrv: 'Heart rate variability',
  vo2max: 'Estimated VO₂ max',
  sleep: 'Sleep',
  bodyFat: 'Body composition',
  activity: 'Weekly activity',
};

export interface BioAgeInput {
  chronologicalAge: number;
  sex: Sex;
  /** Trailing averages, not single days — one bad night is not ageing. */
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  sleepMinutes?: number | null;
  bodyFatPct?: number | null;
  /** Conditioning plus lifting minutes in a typical week. */
  activityMinutesPerWeek?: number | null;
}

export interface MarkerContribution {
  key: MarkerKey;
  label: string;
  value: number;
  unit: string;
  /** What someone of this age typically shows. */
  expected: number;
  /** Years added or removed. Negative is younger. */
  years: number;
  /** True when the marker is helping. */
  favourable: boolean;
  note: string;
}

export type BioAgeConfidence = 'low' | 'fair' | 'good';

export const CONFIDENCE_NOTE: Record<BioAgeConfidence, string> = {
  low: 'Built on very little. Read it as a rough direction, not a number.',
  fair: 'Enough markers to be worth watching month to month.',
  good: 'Most of what this app can see is behind this one.',
};

export interface BioAge {
  /** The headline figure, in years. */
  years: number;
  chronologicalAge: number;
  /** Negative means younger than your years. */
  delta: number;
  markers: MarkerContribution[];
  confidence: BioAgeConfidence;
  headline: string;
}

/** The furthest this index will ever move from someone's real age. */
export const MAX_OFFSET_YEARS = 15;
/** Nobody is told they are younger than this, whatever the markers say. */
export const FLOOR_AGE = 18;

/**
 * Age-expected values.
 *
 * These are rounded, commonly published population figures — good enough to
 * anchor an index, nothing like a reference range a clinician would use. Each
 * returns an expectation and the spread around it, so a marker's distance can
 * be measured in standard deviations and compared across markers.
 */
function expectationFor(key: MarkerKey, age: number, sex: Sex): { expected: number; sd: number } | null {
  const male = sex !== 'female';
  switch (key) {
    case 'restingHeartRate':
      // Barely moves with age in healthy adults.
      return { expected: 62, sd: 9 };
    case 'hrv':
      // Falls steadily through adult life; the decline is the whole point.
      return { expected: Math.max(18, 67 - 0.65 * age), sd: 16 };
    case 'vo2max':
      return male
        ? { expected: Math.max(20, 50 - 0.35 * age), sd: 7 }
        : { expected: Math.max(17, 43 - 0.3 * age), sd: 6 };
    case 'sleep':
      return { expected: 450, sd: 55 };
    case 'bodyFat':
      return male
        ? { expected: 18 + 0.15 * age, sd: 5.5 }
        : { expected: 26 + 0.15 * age, sd: 5.5 };
    case 'activity':
      return { expected: 180, sd: 110 };
    default:
      return null;
  }
}

/** True when a bigger number is the healthier one. */
const HIGHER_IS_BETTER: Record<MarkerKey, boolean> = {
  restingHeartRate: false,
  hrv: true,
  vo2max: true,
  sleep: true,
  bodyFat: false,
  activity: true,
};

/**
 * Years per standard deviation, per marker.
 *
 * VO₂ max carries the most because it is the marker with the strongest
 * relationship to mortality in the literature; sleep and activity carry less
 * because what this app can see of them is coarser.
 */
const YEARS_PER_SD: Record<MarkerKey, number> = {
  vo2max: 3.2,
  hrv: 2.4,
  restingHeartRate: 2.0,
  bodyFat: 1.6,
  activity: 1.4,
  sleep: 1.2,
};

const UNIT: Record<MarkerKey, string> = {
  restingHeartRate: 'bpm',
  hrv: 'ms',
  vo2max: 'ml/kg/min',
  sleep: 'min',
  bodyFat: '%',
  activity: 'min/wk',
};

/**
 * Estimate VO₂ max from resting heart rate.
 *
 * The Uth-Sørensen-Overgaard-Pedersen relation: VO₂ max ≈ 15 × (HRmax /
 * HRrest), with HRmax from Tanaka's 208 − 0.7 × age, which fits adults better
 * than the old 220 − age. It is a real estimate with real error, and it is
 * labelled as an estimate everywhere it appears.
 */
export function estimateVo2Max(restingHeartRate: number, age: number): number | null {
  if (!restingHeartRate || restingHeartRate < 30 || restingHeartRate > 120) return null;
  const hrMax = 208 - 0.7 * age;
  const value = 15 * (hrMax / restingHeartRate);
  if (!Number.isFinite(value) || value < 10 || value > 90) return null;
  return Math.round(value * 10) / 10;
}

export function bioAge(input: BioAgeInput): BioAge | null {
  const age = input.chronologicalAge;
  if (!age || age < 13 || age > 110) return null;

  const markers: MarkerContribution[] = [];

  const add = (key: MarkerKey, value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return;
    const reference = expectationFor(key, age, input.sex);
    if (!reference) return;

    const raw = (value - reference.expected) / reference.sd;
    // Sign it so positive always means "better than expected for your age".
    const better = HIGHER_IS_BETTER[key] ? raw : -raw;
    // Clamped at two standard deviations each way. One extraordinary marker
    // should not be able to carry the whole number on its own.
    const clamped = Math.max(-2, Math.min(2, better));
    const years = Math.round(-clamped * YEARS_PER_SD[key] * 10) / 10;

    markers.push({
      key,
      label: MARKER_LABEL[key],
      value: Math.round(value * 10) / 10,
      unit: UNIT[key],
      expected: Math.round(reference.expected * 10) / 10,
      years,
      favourable: years <= 0,
      note: noteFor(key, value, reference.expected, years),
    });
  };

  add('restingHeartRate', input.restingHeartRate);
  add('hrv', input.hrvMs);
  add(
    'vo2max',
    input.restingHeartRate != null ? estimateVo2Max(input.restingHeartRate, age) : null,
  );
  add('sleep', input.sleepMinutes);
  add('bodyFat', input.bodyFatPct);
  add('activity', input.activityMinutesPerWeek);

  if (markers.length === 0) return null;

  // The mean of the contributions, not the sum: six markers each nudging a
  // year should not add up to six years, and a single marker should not be
  // diluted just because the others are missing.
  const offset = markers.reduce((a, m) => a + m.years, 0) / markers.length;
  const bounded = Math.max(-MAX_OFFSET_YEARS, Math.min(MAX_OFFSET_YEARS, offset));
  const years = Math.max(FLOOR_AGE, Math.round((age + bounded) * 10) / 10);
  const delta = Math.round((years - age) * 10) / 10;

  const confidence: BioAgeConfidence =
    markers.length >= 5 ? 'good' : markers.length >= 3 ? 'fair' : 'low';

  return { years, chronologicalAge: age, delta, markers, confidence, headline: headlineFor(delta, markers) };
}

function noteFor(key: MarkerKey, value: number, expected: number, years: number): string {
  const unit = UNIT[key];
  const shown = key === 'sleep' ? `${Math.round(value / 6) / 10}h` : `${Math.round(value * 10) / 10} ${unit}`;
  const typical = key === 'sleep' ? `${Math.round(expected / 6) / 10}h` : `${Math.round(expected * 10) / 10} ${unit}`;
  if (Math.abs(years) < 0.3) return `${shown}, about what is typical for your age (${typical}).`;
  return `${shown} against a typical ${typical} — worth ${Math.abs(years).toFixed(1)} ${years < 0 ? 'years off' : 'years on'}.`;
}

function headlineFor(delta: number, markers: MarkerContribution[]): string {
  const best = [...markers].sort((a, b) => a.years - b.years)[0]!;
  const worst = [...markers].sort((a, b) => b.years - a.years)[0]!;

  if (Math.abs(delta) < 0.5) {
    return `Right about your years. ${best.label} is the one pulling it down.`;
  }
  if (delta < 0) {
    // The label is used as written: lowercasing it turned "VO₂ max" into
    // "vo₂ max", which reads like a typo.
    return `${Math.abs(delta).toFixed(1)} years younger than your age, mostly on ${best.label}.`;
  }
  return `${delta.toFixed(1)} years older than your age. ${worst.label} is the biggest single reason.`;
}

export interface BioAgeProjection {
  /** Where this lands if the last month's direction holds. */
  years: number;
  /** Days ahead the projection looks. */
  horizonDays: number;
  delta: number;
  note: string;
}

/**
 * Where the index is heading, if the trend holds.
 *
 * Refuses on fewer than two readings a fortnight apart, and refuses to
 * extrapolate more than a month. A projection from a week of data is a
 * straight line drawn through noise, and pushing it out a year would produce
 * a number nobody should act on.
 */
export function projectBioAge(
  history: { date: string; years: number }[],
  horizonDays = 30,
): BioAgeProjection | null {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length < 2) return null;

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanDays = Math.round(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000,
  );
  if (spanDays < 14) return null;

  const perDay = (last.years - first.years) / spanDays;
  // A fitness age that "improves" a year a week is measuring noise. Cap the
  // slope at something a body can actually do.
  const cappedPerDay = Math.max(-0.05, Math.min(0.05, perDay));
  const horizon = Math.min(30, horizonDays);
  const years = Math.round((last.years + cappedPerDay * horizon) * 10) / 10;
  const delta = Math.round((years - last.years) * 10) / 10;

  return {
    years,
    horizonDays: horizon,
    delta,
    note:
      Math.abs(delta) < 0.3
        ? 'Holding steady on the last month of readings.'
        : `On the last month's direction, about ${Math.abs(delta).toFixed(1)} ${Math.abs(delta) === 1 ? 'year' : 'years'} ${delta < 0 ? 'younger' : 'older'} in ${horizon} days — if it holds, which it usually does not exactly.`,
  };
}

export const BIO_AGE_CAVEAT =
  'A fitness index, not a measurement of biological ageing. Real biological-age work uses methylation clocks and blood panels; this reads the handful of markers a phone and a watch can see — heart rate, variability, an estimated VO₂ max, sleep, body composition and how much you move — and expresses them in years because years are easier to feel than six separate numbers. It is not a clinical result, it cannot diagnose anything, and it should never be used to decide anything medical.';
