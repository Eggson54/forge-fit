import type { MeasurementLog, Sex } from './types';
import { MEASUREMENT_SITES, siteSeries, type MeasurementKey } from './measurements';

/**
 * A body-fat estimate from the tape measurements the app already collects.
 *
 * This is the US Navy circumference method. It is an *estimate* built from two
 * or three girths and a height, and it carries real error — commonly quoted at
 * around ±3–4 percentage points against a DEXA scan, and worse at the extremes
 * of very lean and very heavy. It cannot see where fat sits, it cannot tell
 * muscle from anything else, and two people with identical tape numbers can
 * have genuinely different compositions.
 *
 * So the app treats it the way it deserves: the trend over weeks is the useful
 * part, the absolute number is a rough position, and a real measurement the
 * user has entered always wins over the estimate.
 */

/** Which formula to use. Picked by the user, never inferred silently. */
export type BodyFatFormula = 'male' | 'female';

export interface BodyFatInput {
  formula: BodyFatFormula;
  heightCm: number | null;
  neckCm?: number;
  waistCm?: number;
  /** Only the female formula uses this. */
  hipsCm?: number;
}

export interface BodyFatEstimate {
  pct: number;
  formula: BodyFatFormula;
}

/** Which inputs the chosen formula still needs, in the words the UI shows. */
export function missingForBodyFat(input: BodyFatInput): string[] {
  const missing: string[] = [];
  if (!input.heightCm || input.heightCm <= 0) missing.push('Height');
  if (!input.neckCm || input.neckCm <= 0) missing.push('Neck');
  if (!input.waistCm || input.waistCm <= 0) missing.push('Waist');
  if (input.formula === 'female' && (!input.hipsCm || input.hipsCm <= 0)) missing.push('Hips');
  return missing;
}

const log10 = (n: number) => Math.log(n) / Math.LN10;

/**
 * The estimate, or null when an input is missing or the numbers cannot produce
 * one.
 *
 * The formula takes a logarithm of (waist − neck), so a waist measured smaller
 * than the neck is not merely implausible — it is undefined. That happens with
 * a transposed entry more often than you would think, and returning null is
 * the only honest answer.
 */
export function estimateBodyFat(input: BodyFatInput): BodyFatEstimate | null {
  if (missingForBodyFat(input).length > 0) return null;

  const height = input.heightCm!;
  const neck = input.neckCm!;
  const waist = input.waistCm!;

  if (input.formula === 'male') {
    const girth = waist - neck;
    if (girth <= 0) return null;
    const pct = 495 / (1.0324 - 0.19077 * log10(girth) + 0.15456 * log10(height)) - 450;
    return finite(pct, 'male');
  }

  const girth = waist + input.hipsCm! - neck;
  if (girth <= 0) return null;
  const pct = 495 / (1.29579 - 0.35004 * log10(girth) + 0.221 * log10(height)) - 450;
  return finite(pct, 'female');
}

function finite(pct: number, formula: BodyFatFormula): BodyFatEstimate | null {
  if (!Number.isFinite(pct)) return null;
  // Clamped to the range a living person occupies. Outside it the formula has
  // been fed something wrong, and a negative or 80% figure on screen is worse
  // than no figure.
  if (pct < 2 || pct > 70) return null;
  return { pct: Math.round(pct * 10) / 10, formula };
}

export type BodyFatBand = 'essential' | 'athletic' | 'fitness' | 'average' | 'above';

export const BAND_LABEL: Record<BodyFatBand, string> = {
  essential: 'Essential',
  athletic: 'Athletic',
  fitness: 'Fitness',
  average: 'Average',
  above: 'Above average',
};

export const BAND_TINT: Record<BodyFatBand, string> = {
  essential: '#7FB2FF',
  athletic: '#39E6C3',
  fitness: '#C6F135',
  average: '#FFB020',
  above: '#FF7A3D',
};

/**
 * Floors of each band, by formula. These are the commonly published ranges;
 * like the number they classify, they are a rough map rather than a diagnosis,
 * and "above average" is a description of a distribution, not a verdict on a
 * person.
 */
const BAND_FLOOR: Record<BodyFatFormula, Record<BodyFatBand, number>> = {
  male: { essential: 0, athletic: 6, fitness: 14, average: 18, above: 25 },
  female: { essential: 0, athletic: 14, fitness: 21, average: 25, above: 32 },
};

export const BANDS: BodyFatBand[] = ['essential', 'athletic', 'fitness', 'average', 'above'];

export function bodyFatBand(pct: number, formula: BodyFatFormula): BodyFatBand {
  const floors = BAND_FLOOR[formula];
  let band: BodyFatBand = 'essential';
  for (const b of BANDS) {
    if (pct >= floors[b]) band = b;
  }
  return band;
}

export interface BodyComposition {
  pct: number;
  fatMassKg: number;
  leanMassKg: number;
}

/**
 * Split a bodyweight into fat and everything else.
 *
 * "Lean mass" here is all non-fat tissue — muscle, bone, organs, water — not
 * muscle alone. Worth saying, because the number is most useful during a
 * recomposition and it is easy to read it as a muscle count.
 */
export function composition(bodyweightKg: number | null, pct: number | null): BodyComposition | null {
  if (!bodyweightKg || bodyweightKg <= 0 || pct == null || pct <= 0 || pct >= 100) return null;
  const fatMassKg = Math.round(bodyweightKg * (pct / 100) * 10) / 10;
  return {
    pct,
    fatMassKg,
    leanMassKg: Math.round((bodyweightKg - fatMassKg) * 10) / 10,
  };
}

export interface BodyFatPoint {
  date: string;
  pct: number;
  /** True when the user entered a real measurement rather than the tape estimate. */
  measured: boolean;
}

/**
 * Body fat over time, oldest first.
 *
 * A measurement the user entered by hand wins over the estimate for that same
 * entry: if someone has been in a DEXA scanner, the app has nothing to add.
 */
export function bodyFatSeries(
  logs: MeasurementLog[],
  formula: BodyFatFormula,
  heightCm: number | null,
): BodyFatPoint[] {
  return logs
    .map((log) => {
      if (typeof log.bodyFatPct === 'number' && log.bodyFatPct > 0) {
        return { date: log.date, pct: log.bodyFatPct, measured: true };
      }
      const estimate = estimateBodyFat({
        formula,
        heightCm,
        neckCm: log.neckCm,
        waistCm: log.waistCm,
        hipsCm: log.hipsCm,
      });
      return estimate ? { date: log.date, pct: estimate.pct, measured: false } : null;
    })
    .filter((p): p is BodyFatPoint => p !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface BodyFatChange {
  first: BodyFatPoint;
  last: BodyFatPoint;
  deltaPct: number;
}

/** Change from the earliest estimate to the latest. Null with fewer than two. */
export function bodyFatChange(series: BodyFatPoint[]): BodyFatChange | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  return { first, last, deltaPct: Math.round((last.pct - first.pct) * 10) / 10 };
}

/**
 * Which tape sites this formula reads, so the measurements screen can mark
 * them rather than leaving the user to guess why nothing appeared.
 */
export function sitesUsedBy(formula: BodyFatFormula): MeasurementKey[] {
  const keys: MeasurementKey[] = ['neckCm', 'waistCm'];
  if (formula === 'female') keys.push('hipsCm');
  return keys;
}

export function siteLabelsUsedBy(formula: BodyFatFormula): string[] {
  const used = new Set<MeasurementKey>(sitesUsedBy(formula));
  return MEASUREMENT_SITES.filter((s) => used.has(s.key)).map((s) => s.label);
}

/** The latest value recorded for each site the formula needs. */
export function latestInputs(logs: MeasurementLog[]): { neckCm?: number; waistCm?: number; hipsCm?: number } {
  const pick = (key: MeasurementKey) => {
    const series = siteSeries(logs, key);
    return series.length ? series[series.length - 1]!.cm : undefined;
  };
  return { neckCm: pick('neckCm'), waistCm: pick('waistCm'), hipsCm: pick('hipsCm') };
}

export function defaultFormula(sex: Sex): BodyFatFormula {
  return sex === 'female' ? 'female' : 'male';
}

export const BODY_FAT_CAVEAT =
  'A tape estimate, not a measurement. The Navy formula reads two or three girths and a height, so it runs around three to four points off a DEXA scan and further at the extremes. Watch which way it moves over weeks; do not read the single number too hard.';
