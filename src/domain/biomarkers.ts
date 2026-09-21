import type { ISODate, Sex } from './types';

/**
 * Blood panel tracking.
 *
 * This is a *record*, not a reading of one. The app will show a value against
 * the reference range, plot it over time and say whether it moved — and it
 * will not tell anyone what a result means, what to do about it, or whether
 * to worry. Those are a clinician's job and the file says so wherever it can.
 *
 * One design decision does most of the work: the reference range comes from
 * the user's own report by preference, and the built-in figures are only a
 * prefill labelled "typical". Reference ranges genuinely differ between labs,
 * assays and populations, so an app that prints its own range over somebody's
 * actual lab slip is not being helpful — it is being wrong with confidence.
 */

export type BiomarkerGroup = 'lipids' | 'metabolic' | 'inflammation' | 'hormones' | 'organs' | 'blood' | 'vitamins';

export const GROUP_LABEL: Record<BiomarkerGroup, string> = {
  lipids: 'Lipids',
  metabolic: 'Metabolic',
  inflammation: 'Inflammation',
  hormones: 'Hormones',
  organs: 'Liver & kidney',
  blood: 'Blood count',
  vitamins: 'Vitamins & minerals',
};

export interface BiomarkerDef {
  key: string;
  label: string;
  unit: string;
  group: BiomarkerGroup;
  /** Typical reference range, as a prefill only. */
  typical: { low: number; high: number };
  /** When a lab's range differs by sex. */
  typicalBySex?: Partial<Record<Sex, { low: number; high: number }>>;
  /** What the marker is, in a sentence. Never what a result means. */
  what: string;
}

/**
 * The markers people actually get back on a standard panel.
 *
 * Every range here is a commonly published one and is treated as a starting
 * value the user is expected to overwrite from their own report.
 */
export const BIOMARKERS: BiomarkerDef[] = [
  { key: 'total_cholesterol', label: 'Total cholesterol', unit: 'mg/dL', group: 'lipids', typical: { low: 125, high: 200 }, what: 'All the cholesterol carried in your blood, across every particle type.' },
  { key: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', group: 'lipids', typical: { low: 0, high: 100 }, what: 'Cholesterol carried on low-density particles.' },
  { key: 'hdl', label: 'HDL cholesterol', unit: 'mg/dL', group: 'lipids', typical: { low: 40, high: 90 }, typicalBySex: { female: { low: 50, high: 90 } }, what: 'Cholesterol carried on high-density particles.' },
  { key: 'triglycerides', label: 'Triglycerides', unit: 'mg/dL', group: 'lipids', typical: { low: 0, high: 150 }, what: 'Fat circulating in the blood, strongly affected by when you last ate.' },
  { key: 'apob', label: 'ApoB', unit: 'mg/dL', group: 'lipids', typical: { low: 0, high: 90 }, what: 'A count of the particles that carry cholesterol, rather than the cholesterol in them.' },

  { key: 'fasting_glucose', label: 'Fasting glucose', unit: 'mg/dL', group: 'metabolic', typical: { low: 70, high: 99 }, what: 'Blood sugar after not eating overnight.' },
  { key: 'hba1c', label: 'HbA1c', unit: '%', group: 'metabolic', typical: { low: 4, high: 5.6 }, what: 'Roughly the last three months of average blood sugar, read off your red cells.' },
  { key: 'insulin', label: 'Fasting insulin', unit: 'µIU/mL', group: 'metabolic', typical: { low: 2, high: 12 }, what: 'How much insulin is circulating while fasted.' },

  { key: 'hscrp', label: 'hs-CRP', unit: 'mg/L', group: 'inflammation', typical: { low: 0, high: 3 }, what: 'A general marker of inflammation. Rises with any recent infection or hard training.' },

  { key: 'testosterone', label: 'Total testosterone', unit: 'ng/dL', group: 'hormones', typical: { low: 300, high: 1000 }, typicalBySex: { female: { low: 15, high: 70 } }, what: 'Total testosterone in the blood, bound and free together.' },
  { key: 'free_testosterone', label: 'Free testosterone', unit: 'pg/mL', group: 'hormones', typical: { low: 47, high: 244 }, typicalBySex: { female: { low: 0.1, high: 6.4 } }, what: 'The fraction not bound to carrier proteins.' },
  { key: 'shbg', label: 'SHBG', unit: 'nmol/L', group: 'hormones', typical: { low: 10, high: 57 }, typicalBySex: { female: { low: 18, high: 144 } }, what: 'The protein that binds sex hormones and decides how much is free.' },
  { key: 'tsh', label: 'TSH', unit: 'mIU/L', group: 'hormones', typical: { low: 0.4, high: 4 }, what: 'The signal your pituitary sends to your thyroid.' },
  { key: 'cortisol', label: 'Cortisol (AM)', unit: 'µg/dL', group: 'hormones', typical: { low: 6, high: 18 }, what: 'Morning cortisol. Moves a great deal with time of day and with stress on the day.' },

  { key: 'alt', label: 'ALT', unit: 'U/L', group: 'organs', typical: { low: 7, high: 55 }, what: 'A liver enzyme. Also rises after heavy resistance training.' },
  { key: 'ast', label: 'AST', unit: 'U/L', group: 'organs', typical: { low: 8, high: 48 }, what: 'An enzyme found in liver and muscle, so lifting moves it too.' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', group: 'organs', typical: { low: 0.7, high: 1.3 }, typicalBySex: { female: { low: 0.6, high: 1.1 } }, what: 'A muscle breakdown product the kidneys clear. Higher in people with more muscle.' },
  { key: 'egfr', label: 'eGFR', unit: 'mL/min/1.73m²', group: 'organs', typical: { low: 90, high: 140 }, what: 'An estimate of kidney filtration, calculated from creatinine.' },

  { key: 'hemoglobin', label: 'Haemoglobin', unit: 'g/dL', group: 'blood', typical: { low: 13.5, high: 17.5 }, typicalBySex: { female: { low: 12, high: 15.5 } }, what: 'The oxygen-carrying protein in red cells.' },
  { key: 'hematocrit', label: 'Haematocrit', unit: '%', group: 'blood', typical: { low: 38.8, high: 50 }, typicalBySex: { female: { low: 34.9, high: 44.5 } }, what: 'The share of blood volume made up of red cells.' },
  { key: 'ferritin', label: 'Ferritin', unit: 'ng/mL', group: 'blood', typical: { low: 24, high: 336 }, typicalBySex: { female: { low: 11, high: 307 } }, what: 'Stored iron. Also rises with inflammation, which complicates reading it.' },
  { key: 'wbc', label: 'White cell count', unit: 'K/µL', group: 'blood', typical: { low: 4, high: 11 }, what: 'How many white cells are circulating.' },

  { key: 'vitamin_d', label: 'Vitamin D (25-OH)', unit: 'ng/mL', group: 'vitamins', typical: { low: 30, high: 100 }, what: 'The stored form of vitamin D.' },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'pg/mL', group: 'vitamins', typical: { low: 200, high: 900 }, what: 'Circulating B12.' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg/dL', group: 'vitamins', typical: { low: 1.7, high: 2.2 }, what: 'Serum magnesium, which is a small and poorly representative share of body stores.' },
];

export function biomarkerByKey(key: string): BiomarkerDef | null {
  return BIOMARKERS.find((b) => b.key === key) ?? null;
}

export interface BiomarkerReading {
  id: string;
  key: string;
  value: number;
  date: ISODate;
  /** The range printed on this user's own report, when they entered it. */
  refLow?: number;
  refHigh?: number;
  /** Groups readings that came off one blood draw. */
  panelId?: string;
  note?: string;
}

export type RangeVerdict = 'below' | 'in_range' | 'above';

export interface RangeReading {
  verdict: RangeVerdict;
  low: number;
  high: number;
  /** Whose range was used. The distinction matters and is shown. */
  source: 'yours' | 'typical';
  /** 0 at the bottom of the range, 1 at the top. Outside it, beyond that. */
  position: number;
  note: string;
}

/**
 * Where a value sits in the range — the user's own if they have it.
 *
 * Never returns a judgement about health, only about the range, and always
 * says which range it used. Printing "high" against a range the lab did not
 * use is worse than printing nothing.
 */
export function readAgainstRange(
  reading: BiomarkerReading,
  def: BiomarkerDef,
  sex: Sex,
): RangeReading {
  const own = typeof reading.refLow === 'number' && typeof reading.refHigh === 'number' && reading.refHigh > reading.refLow;
  const fallback = def.typicalBySex?.[sex] ?? def.typical;
  const low = own ? reading.refLow! : fallback.low;
  const high = own ? reading.refHigh! : fallback.high;
  const source: RangeReading['source'] = own ? 'yours' : 'typical';

  const verdict: RangeVerdict = reading.value < low ? 'below' : reading.value > high ? 'above' : 'in_range';
  const span = high - low;
  const position = span > 0 ? (reading.value - low) / span : 0.5;

  const whose = source === 'yours' ? 'your report’s range' : 'a typical range';
  const note =
    verdict === 'in_range'
      ? `Inside ${whose} of ${format(low)}–${format(high)} ${def.unit}.`
      : `${verdict === 'above' ? 'Above' : 'Below'} ${whose} of ${format(low)}–${format(high)} ${def.unit}. Your clinician is the person to ask what that means for you.`;

  return { verdict, low, high, source, position, note };
}

function format(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** One marker over time, oldest first. */
export function markerSeries(readings: BiomarkerReading[], key: string): BiomarkerReading[] {
  return readings
    .filter((r) => r.key === key && Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface MarkerChange {
  first: BiomarkerReading;
  last: BiomarkerReading;
  delta: number;
  percent: number;
}

/**
 * Movement between the earliest and latest reading of a marker.
 *
 * Deliberately says nothing about whether the direction is good. For most of
 * these that depends on the person, the rest of the panel and the reason the
 * test was run, and an app guessing at it would be inventing medical opinion.
 */
export function markerChange(series: BiomarkerReading[]): MarkerChange | null {
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const delta = Math.round((last.value - first.value) * 100) / 100;
  const percent = first.value !== 0 ? Math.round((delta / Math.abs(first.value)) * 1000) / 10 : 0;
  return { first, last, delta, percent };
}

export interface PanelSummary {
  date: ISODate;
  total: number;
  inRange: number;
  outOfRange: number;
  /** Markers outside range, for the line at the top. */
  flagged: { key: string; label: string; verdict: RangeVerdict }[];
}

/** What one blood draw looked like, counted rather than interpreted. */
export function summarisePanel(
  readings: BiomarkerReading[],
  date: ISODate,
  sex: Sex,
): PanelSummary | null {
  const day = readings.filter((r) => r.date === date);
  if (day.length === 0) return null;

  const flagged: PanelSummary['flagged'] = [];
  let inRange = 0;
  for (const r of day) {
    const def = biomarkerByKey(r.key);
    if (!def) continue;
    const read = readAgainstRange(r, def, sex);
    if (read.verdict === 'in_range') inRange += 1;
    else flagged.push({ key: r.key, label: def.label, verdict: read.verdict });
  }

  return { date, total: day.length, inRange, outOfRange: flagged.length, flagged };
}

/** The dates that have readings, most recent first. */
export function panelDates(readings: BiomarkerReading[]): ISODate[] {
  return [...new Set(readings.map((r) => r.date))].sort((a, b) => (a < b ? 1 : -1));
}

/**
 * The line at the top of the screen.
 *
 * Counts and names. It does not rank findings by seriousness, because
 * seriousness is a clinical judgement and the app has no business making one.
 */
export function readPanel(summary: PanelSummary | null): string | null {
  if (!summary) return null;
  if (summary.total === 0) return null;
  if (summary.outOfRange === 0) {
    return `All ${summary.total} ${summary.total === 1 ? 'marker' : 'markers'} from this draw sit inside their reference range.`;
  }
  const names = summary.flagged.slice(0, 3).map((f) => f.label).join(', ');
  const more = summary.flagged.length > 3 ? `, and ${summary.flagged.length - 3} more` : '';
  return `${summary.outOfRange} of ${summary.total} outside the reference range: ${names}${more}. Worth going through with whoever ordered the test.`;
}

export const BIOMARKER_CAVEAT =
  'This is somewhere to keep your results and watch them move. It is not a reading of them. The app does not know why a test was ordered, what else is going on with you, or what any of it means — and reference ranges differ between labs, which is why yours from your own report always wins over the prefilled one. Nothing here is a diagnosis and nothing here is diagnostic. Go through anything that stands out with the clinician who ordered it.';
