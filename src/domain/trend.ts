/**
 * Trend maths for noisy daily series — body weight above all.
 *
 * A scale reading swings a kilo or two with water, sodium, food in transit and
 * time of day. Plotting the raw points and calling the first-to-last gap
 * "progress" reports noise as a result: on a genuine 0.4 kg/week cut, two
 * unlucky weigh-ins can show a gain.
 */

export interface DatedValue {
  date: string;
  value: number;
}

/**
 * Trailing mean over `window` points, oldest first. The first points average
 * over what exists rather than being dropped, so the line starts where the
 * data does instead of a week late.
 */
export function movingAverage(series: DatedValue[], window = 7): DatedValue[] {
  if (window < 1) return series;
  return series.map((point, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = series.slice(from, i + 1);
    const mean = slice.reduce((a, p) => a + p.value, 0) / slice.length;
    return { date: point.date, value: Math.round(mean * 100) / 100 };
  });
}

/**
 * Change per week from a least-squares fit over the whole series, in units of
 * `value` per 7 days. Null with fewer than two points, or when every reading
 * lands on the same day and the slope is undefined.
 *
 * A fit uses every reading; first-versus-last uses two and throws the rest
 * away, which is why it is so easily wrong.
 */
export function ratePerWeek(series: DatedValue[]): number | null {
  if (series.length < 2) return null;
  const t0 = Date.parse(`${series[0]!.date}T00:00:00`);
  const xs = series.map((p) => (Date.parse(`${p.date}T00:00:00`) - t0) / 86_400_000);
  const ys = series.map((p) => p.value);

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 1000) / 1000;
}

/**
 * The reading closest in time to `date`, within `toleranceDays`.
 *
 * Progress photos and weigh-ins rarely land on the same day, so an exact match
 * would leave most photos with no weight against them. Null beyond the
 * tolerance rather than reaching for a number from a month away.
 */
export function nearestValue(series: DatedValue[], date: string, toleranceDays = 7): DatedValue | null {
  const target = Date.parse(`${date}T00:00:00`);
  let best: DatedValue | null = null;
  let bestGap = Infinity;
  for (const point of series) {
    const gap = Math.abs(Date.parse(`${point.date}T00:00:00`) - target) / 86_400_000;
    if (gap < bestGap) {
      bestGap = gap;
      best = point;
    }
  }
  return best && bestGap <= toleranceDays ? best : null;
}

/** Whole days between two calendar dates, always positive. */
export function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`)) / 86_400_000);
}

export type ProjectionVerdict =
  | 'on_course'
  | 'wrong_way'
  | 'too_slow'
  | 'arrived'
  | 'not_enough_data';

export interface GoalProjection {
  verdict: ProjectionVerdict;
  /** Per-week change actually observed, in the series' own units. */
  ratePerWeek: number | null;
  /** Whole weeks to the goal at the observed rate; null unless on course. */
  weeks: number | null;
  /** ISO date the goal would be reached; null unless on course. */
  date: string | null;
}

/** How close is close enough to call it arrived, in the series' units. */
const ARRIVED_BAND = 0.3;

/**
 * When the current trend would reach a goal — with four ways of declining to
 * answer, because a projection from noisy data is the easiest place in a
 * fitness app to mislead someone.
 *
 * It refuses when: there are too few readings to fit a line at all; the trend
 * is moving away from the goal; or the trend is so flat that the honest answer
 * is a number of years. "You will get there in 340 weeks" is technically the
 * arithmetic and practically a lie about what the data supports.
 *
 * `minWeeklyRate` is the smallest movement worth extrapolating from.
 */
export function projectGoal(
  series: DatedValue[],
  goal: number,
  options: { minReadings?: number; minWeeklyRate?: number; maxWeeks?: number; today?: string } = {},
): GoalProjection {
  const { minReadings = 5, minWeeklyRate = 0.05, maxWeeks = 104 } = options;

  if (series.length < minReadings) {
    return { verdict: 'not_enough_data', ratePerWeek: null, weeks: null, date: null };
  }

  const rate = ratePerWeek(series);
  const latest = series[series.length - 1]!.value;
  const gap = goal - latest;

  if (Math.abs(gap) <= ARRIVED_BAND) {
    return { verdict: 'arrived', ratePerWeek: rate, weeks: 0, date: null };
  }
  if (rate == null) {
    return { verdict: 'not_enough_data', ratePerWeek: null, weeks: null, date: null };
  }
  // Moving away from the goal, or not moving at all.
  if (Math.abs(rate) < minWeeklyRate || Math.sign(rate) !== Math.sign(gap)) {
    return {
      verdict: Math.abs(rate) < minWeeklyRate ? 'too_slow' : 'wrong_way',
      ratePerWeek: rate,
      weeks: null,
      date: null,
    };
  }

  const weeks = gap / rate;
  if (weeks > maxWeeks) {
    return { verdict: 'too_slow', ratePerWeek: rate, weeks: null, date: null };
  }

  const from = options.today ?? series[series.length - 1]!.date;
  const target = new Date(`${from}T00:00:00`);
  target.setDate(target.getDate() + Math.round(weeks * 7));
  return {
    verdict: 'on_course',
    ratePerWeek: rate,
    weeks: Math.max(1, Math.round(weeks)),
    date: target.toISOString().slice(0, 10),
  };
}
