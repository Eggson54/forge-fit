import { clamp, round } from './units';
import type { ISODate } from './types';

/**
 * A sleep score.
 *
 * Every wearable ships one and no two agree, because there is no standard for
 * what the number means — each is a weighting somebody chose. So the rules
 * here are written down rather than buried, the components are shown
 * separately, and the weighting is stated on the screen. If somebody disagrees
 * with the weighting they can at least see what it was.
 *
 * Three commitments shape the whole file:
 *
 *  1. **A missing input is never a zero.** A watch that does not report REM
 *     is not a night with no REM. Missing components are dropped and the
 *     remaining weights are renormalised, and the result says what it could
 *     not see. Scoring an absent stage as nought is the single most common
 *     way these numbers lie.
 *  2. **Stage data is an estimate.** A wrist device infers stages from
 *     movement and heart rate; polysomnography is the reference standard and
 *     agreement between the two is moderate at best. The copy says so, and
 *     the stage components are deliberately weighted below duration because
 *     duration is the part that is actually measured well.
 *  3. **It is not a diagnosis.** Persistent bad sleep is a doctor's question,
 *     and a number from a watch is not an answer to it.
 */

// ------------------------------------------------------------- inputs ------

export interface SleepNight {
  date: ISODate;
  /** Minutes actually asleep. The one figure every device reports. */
  asleepMinutes: number;
  /** Light/core sleep, when the device distinguishes it. */
  coreMinutes?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  /** Minutes awake *after* first falling asleep. */
  awakeMinutes?: number | null;
  /** Total time in bed, asleep or not. */
  inBedMinutes?: number | null;
  /** ISO datetime the night began and ended, for the consistency component. */
  bedtime?: string | null;
  wakeTime?: string | null;
}

export interface SleepContext {
  /** The athlete's own target, in minutes. Defaults to eight hours. */
  targetMinutes?: number;
  /** Previous nights, for bedtime consistency. Most recent first or last — order does not matter. */
  recent?: SleepNight[];
}

// --------------------------------------------------------- the weights -----

export type SleepComponentKey = 'duration' | 'deep' | 'rem' | 'efficiency' | 'consistency' | 'restfulness';

/**
 * How much each part counts, before renormalising for missing data.
 *
 * Duration dominates on purpose: it is the component a wrist device measures
 * rather than infers, and the one with the clearest relationship to how
 * somebody actually feels. The two stage components together are worth less
 * than duration alone, which is the honest reflection of how much to trust
 * them.
 */
export const SLEEP_WEIGHTS: Record<SleepComponentKey, number> = {
  duration: 40,
  deep: 12,
  rem: 12,
  efficiency: 16,
  consistency: 12,
  restfulness: 8,
};

export const SLEEP_COMPONENT_LABEL: Record<SleepComponentKey, string> = {
  duration: 'Duration',
  deep: 'Deep sleep',
  rem: 'REM sleep',
  efficiency: 'Efficiency',
  consistency: 'Consistency',
  restfulness: 'Restfulness',
};

export const DEFAULT_SLEEP_TARGET_MINUTES = 8 * 60;

/**
 * Healthy adult reference proportions, as a share of time asleep.
 *
 * Deep sleep is commonly cited around 13–23% and REM around 20–25% for
 * adults. Both drift with age and both vary a lot night to night, so these
 * are used as a *band to reach* rather than a target to hit exactly — over
 * the band scores full marks rather than being penalised, because there is
 * no evidence that more deep sleep than this is worse.
 */
export const DEEP_TARGET_SHARE = 0.13;
export const REM_TARGET_SHARE = 0.20;

// -------------------------------------------------------- the components ---

export interface SleepComponent {
  key: SleepComponentKey;
  label: string;
  /** 0–100 for this component alone. */
  score: number;
  weight: number;
  /** What the component was computed from, for the row under it. */
  detail: string;
}

function durationScore(minutes: number, target: number): number {
  if (minutes <= 0) return 0;
  const ratio = minutes / target;
  // Full marks at target. Below it, falls off proportionally but not to zero
  // until nothing at all — six hours against an eight-hour target is a poor
  // night, not a catastrophic one.
  if (ratio >= 1) {
    // Well over target is mildly penalised: consistently sleeping far more
    // than you need is worth noticing, though it is a much weaker signal
    // than sleeping too little and is scored that way.
    return ratio > 1.3 ? clamp(100 - (ratio - 1.3) * 60, 80, 100) : 100;
  }
  return clamp(ratio * 100, 0, 100);
}

/** A stage against its reference share, where over the reference is fine. */
function stageScore(stageMinutes: number, asleepMinutes: number, targetShare: number): number {
  if (asleepMinutes <= 0) return 0;
  const share = stageMinutes / asleepMinutes;
  return clamp((share / targetShare) * 100, 0, 100);
}

function efficiencyScore(asleep: number, inBed: number): number {
  if (inBed <= 0) return 0;
  const pct = (asleep / inBed) * 100;
  // 85% is the usual clinical threshold for "efficient". Scaled so 85 lands
  // at 100 and below it falls away.
  return clamp((pct / 85) * 100, 0, 100);
}

/**
 * How steady the schedule is, from the spread of recent bedtimes.
 *
 * Uses the clock time of going to bed rather than the date, and handles the
 * midnight wrap: 23:40 and 00:10 are thirty minutes apart, not twenty-three
 * and a half hours.
 */
export function bedtimeSpreadMinutes(nights: SleepNight[]): number | null {
  const times = nights
    .map((n) => n.bedtime)
    .filter((b): b is string => typeof b === 'string' && b.length > 0)
    .map((b) => {
      const at = new Date(b);
      return Number.isNaN(at.getTime()) ? null : at.getHours() * 60 + at.getMinutes();
    })
    .filter((m): m is number => m != null);

  if (times.length < 3) return null;

  // Shift everything into a frame centred on the first sample, so a night
  // either side of midnight stays adjacent.
  const base = times[0]!;
  const shifted = times.map((t) => {
    let d = t - base;
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    return d;
  });

  const mean = shifted.reduce((a, b) => a + b, 0) / shifted.length;
  const variance = shifted.reduce((a, b) => a + (b - mean) ** 2, 0) / shifted.length;
  return Math.sqrt(variance);
}

function consistencyScore(spread: number): number {
  // Half an hour of drift is unremarkable; two hours is a different schedule
  // every night.
  return clamp(100 - Math.max(0, spread - 30) * (100 / 90), 0, 100);
}

function restfulnessScore(awakeMinutes: number, asleepMinutes: number): number {
  if (asleepMinutes <= 0) return 0;
  // Everybody wakes briefly; around twenty minutes across a night is normal.
  const excess = Math.max(0, awakeMinutes - 20);
  return clamp(100 - excess * 1.5, 0, 100);
}

// ------------------------------------------------------------- result ------

export interface SleepScore {
  /** 0–100, or null when there was not enough to score at all. */
  score: number | null;
  band: 'poor' | 'fair' | 'good' | 'excellent' | 'unknown';
  components: SleepComponent[];
  /** Components that could not be computed, named for the screen. */
  missing: SleepComponentKey[];
  /** The sentence at the top. */
  read: string;
}

export function bandFor(score: number): SleepScore['band'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'fair';
  return 'poor';
}

export const BAND_LABEL: Record<SleepScore['band'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Not enough data',
};

/**
 * Score one night.
 *
 * Returns null rather than a number when the night has no usable duration:
 * the alternative is a zero, and a zero is a measurement. "No data" and "you
 * slept badly" must not look the same.
 */
export function sleepScore(night: SleepNight, context: SleepContext = {}): SleepScore {
  const target = context.targetMinutes ?? DEFAULT_SLEEP_TARGET_MINUTES;
  const asleep = night.asleepMinutes;

  if (!Number.isFinite(asleep) || asleep <= 0) {
    return {
      score: null,
      band: 'unknown',
      components: [],
      missing: ['duration'],
      read: 'No sleep recorded for this night. Nothing here is a zero — it is simply missing.',
    };
  }

  const components: SleepComponent[] = [];
  const missing: SleepComponentKey[] = [];

  const add = (key: SleepComponentKey, score: number, detail: string) =>
    components.push({ key, label: SLEEP_COMPONENT_LABEL[key], score: round(score), weight: SLEEP_WEIGHTS[key], detail });

  add('duration', durationScore(asleep, target), `${formatHm(asleep)} against ${formatHm(target)}`);

  if (night.deepMinutes != null) {
    add('deep', stageScore(night.deepMinutes, asleep, DEEP_TARGET_SHARE),
      `${formatHm(night.deepMinutes)} · ${Math.round((night.deepMinutes / asleep) * 100)}% of the night`);
  } else missing.push('deep');

  if (night.remMinutes != null) {
    add('rem', stageScore(night.remMinutes, asleep, REM_TARGET_SHARE),
      `${formatHm(night.remMinutes)} · ${Math.round((night.remMinutes / asleep) * 100)}% of the night`);
  } else missing.push('rem');

  if (night.inBedMinutes != null && night.inBedMinutes > 0) {
    add('efficiency', efficiencyScore(asleep, night.inBedMinutes),
      `${Math.round((asleep / night.inBedMinutes) * 100)}% of ${formatHm(night.inBedMinutes)} in bed`);
  } else missing.push('efficiency');

  const spread = bedtimeSpreadMinutes([...(context.recent ?? []), night]);
  if (spread != null) {
    add('consistency', consistencyScore(spread), `Bedtime varies by about ${Math.round(spread)} min`);
  } else missing.push('consistency');

  if (night.awakeMinutes != null) {
    add('restfulness', restfulnessScore(night.awakeMinutes, asleep), `${formatHm(night.awakeMinutes)} awake after falling asleep`);
  } else missing.push('restfulness');

  // Renormalise across what was actually available, so a device that reports
  // no stages is not silently capped at the weight of the rest.
  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  const score = totalWeight > 0
    ? Math.round(components.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight)
    : 0;

  return { score, band: bandFor(score), components, missing, read: readFor(score, components, missing, night, target) };
}

function readFor(
  score: number,
  components: SleepComponent[],
  missing: SleepComponentKey[],
  night: SleepNight,
  target: number,
): string {
  const worst = [...components].sort((a, b) => a.score - b.score)[0];
  const band = BAND_LABEL[bandFor(score)].toLowerCase();

  const short = night.asleepMinutes < target - 30;
  const lead = short
    ? `${formatHm(target - night.asleepMinutes)} short of your target.`
    : `${formatHm(night.asleepMinutes)} asleep.`;

  const weak = worst && worst.score < 70 ? ` Weakest part was ${worst.label.toLowerCase()} — ${worst.detail.toLowerCase()}.` : '';
  const gap = missing.length > 0
    ? ` Scored without ${missing.map((m) => SLEEP_COMPONENT_LABEL[m].toLowerCase()).join(' or ')}, which this device did not report.`
    : '';

  return `${lead} A ${band} night overall.${weak}${gap}`;
}

// -------------------------------------------------------------- trend ------

export interface SleepTrend {
  nights: { date: ISODate; score: number | null }[];
  /** Mean over nights that scored, ignoring the ones with no data. */
  average: number | null;
  /** Nights actually scored, so an average of two is not read as a fortnight. */
  scored: number;
  /** Mean minutes asleep across scored nights. */
  averageAsleepMinutes: number | null;
}

/**
 * A run of nights.
 *
 * Unscored nights stay in the series as null rather than being dropped, so a
 * chart shows the gap instead of closing it — a week with three missing
 * nights should look like a week with three missing nights.
 */
export function sleepTrend(nights: SleepNight[], context: SleepContext = {}): SleepTrend {
  const sorted = [...nights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const scored = sorted.map((night) => ({
    date: night.date,
    score: sleepScore(night, { ...context, recent: sorted }).score,
  }));

  const usable = scored.filter((n): n is { date: ISODate; score: number } => n.score != null);
  const durations = sorted.filter((n) => n.asleepMinutes > 0).map((n) => n.asleepMinutes);

  return {
    nights: scored,
    average: usable.length ? Math.round(usable.reduce((a, n) => a + n.score, 0) / usable.length) : null,
    scored: usable.length,
    averageAsleepMinutes: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
  };
}

// -------------------------------------------------------------- copy -------

export function formatHm(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const SLEEP_SCORE_NOTE =
  'The weighting is duration 40, efficiency 16, deep 12, REM 12, consistency 12, restfulness 8 — written down because every wearable scores sleep differently and none of them tell you how. Anything your device did not report is dropped and the rest reweighted, never counted as zero.';

export const SLEEP_STAGE_CAVEAT =
  'Stages from a wrist device are inferred from movement and heart rate, not measured. Agreement with a sleep-lab study is moderate at best, which is why duration — the part that is measured — carries more weight here than deep and REM together.';

export const SLEEP_MEDICAL_NOTE =
  'This is not a medical assessment and cannot diagnose anything. Sleep that is persistently short, broken or unrefreshing — or loud snoring and gasping, which no wearable detects reliably — is worth raising with a doctor rather than an app.';
