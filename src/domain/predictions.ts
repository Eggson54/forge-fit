import { KM, formatDuration } from './track';
import type { EffortRecord } from './bestEfforts';
import { daysBetweenDates, todayISO } from './date';
import type { ISODate } from './types';

/**
 * Race-time predictions from what you have already run.
 *
 * Riegel's formula: t₂ = t₁ × (d₂/d₁)^1.06. It is an empirical curve fitted to
 * race results in the 1970s, and it holds up surprisingly well between about
 * 1500 m and the marathon — provided the athlete has trained for the longer
 * distance. That proviso is the whole problem with predictions of this kind:
 * the formula will happily extrapolate a good 5k into a marathon time that
 * nobody who has not run thirty miles a week is going to see.
 *
 * So every prediction here carries how far it was extrapolated, and the ones
 * that reach past what the evidence supports say so rather than being hidden
 * or shown plain.
 */

/**
 * Riegel's exponent. 1.06 is the published value; higher means the curve
 * punishes distance harder.
 */
export const FATIGUE_EXPONENT = 1.06;

export function riegel(knownSeconds: number, knownMeters: number, targetMeters: number): number {
  if (knownSeconds <= 0 || knownMeters <= 0 || targetMeters <= 0) return 0;
  return knownSeconds * Math.pow(targetMeters / knownMeters, FATIGUE_EXPONENT);
}

export interface RaceTarget {
  key: string;
  label: string;
  meters: number;
}

export const RACE_TARGETS: RaceTarget[] = [
  { key: '5k', label: '5 km', meters: 5 * KM },
  { key: '10k', label: '10 km', meters: 10 * KM },
  { key: 'half', label: 'Half marathon', meters: 21_097.5 },
  { key: 'marathon', label: 'Marathon', meters: 42_195 },
];

export type Confidence = 'good' | 'fair' | 'stretch';

export interface Prediction {
  target: RaceTarget;
  seconds: number;
  /** The effort the prediction was built from. */
  fromLabel: string;
  fromSeconds: number;
  fromDate: ISODate;
  /** How many times further the target is than the evidence. */
  extrapolation: number;
  confidence: Confidence;
  note: string;
}

/**
 * The best basis for predicting a target: the effort closest to it in
 * distance, preferring longer evidence over shorter.
 *
 * Predicting a marathon from a 400 m is arithmetically possible and
 * meaningless. Predicting one from a half is worth printing.
 */
function bestBasis(target: RaceTarget, records: EffortRecord[]): EffortRecord | null {
  const usable = records.filter((r) => r.meters >= KM && r.seconds > 0);
  if (usable.length === 0) return null;

  return usable.reduce((best, r) => {
    const rGap = Math.abs(Math.log(r.meters / target.meters));
    const bGap = Math.abs(Math.log(best.meters / target.meters));
    if (Math.abs(rGap - bGap) < 0.01) return r.meters > best.meters ? r : best;
    return rGap < bGap ? r : best;
  });
}

/**
 * How much to trust a prediction.
 *
 * Two things degrade it: how far it was extrapolated, and how stale the
 * evidence is. Six months is the cut — a 10 k from last spring says something
 * about last spring.
 */
function confidenceOf(extrapolation: number, ageDays: number): Confidence {
  // The formula is well behaved out to roughly triple the evidence distance —
  // predicting a 10 k from a 5 k is the case it was fitted on, and calling
  // that merely "fair" would make the labels useless. Past about five times,
  // it is arithmetic rather than evidence.
  if (extrapolation > 5 || ageDays > 180) return 'stretch';
  if (extrapolation > 2.5 || ageDays > 90) return 'fair';
  return 'good';
}

export function predictRaces(
  records: EffortRecord[],
  today: ISODate = todayISO(),
  targets = RACE_TARGETS,
): Prediction[] {
  const out: Prediction[] = [];

  for (const target of targets) {
    const basis = bestBasis(target, records);
    if (!basis) continue;

    const seconds = riegel(basis.seconds, basis.meters, target.meters);
    const extrapolation = target.meters / basis.meters;
    const ageDays = Math.max(0, daysBetweenDates(basis.date, today));
    const confidence = confidenceOf(extrapolation, ageDays);

    out.push({
      target,
      seconds,
      fromLabel: basis.label,
      fromSeconds: basis.seconds,
      fromDate: basis.date,
      extrapolation: Math.round(extrapolation * 10) / 10,
      confidence,
      note: noteFor(target, basis, extrapolation, ageDays, confidence),
    });
  }

  return out;
}

function noteFor(
  target: RaceTarget,
  basis: EffortRecord,
  extrapolation: number,
  ageDays: number,
  confidence: Confidence,
): string {
  const from = `From your ${basis.label.toLowerCase()} of ${formatDuration(basis.seconds)}`;
  const stale = ageDays > 180 ? `, set ${Math.round(ageDays / 30)} months ago` : '';

  if (extrapolation > 5) {
    return `${from}${stale}. That is ${Math.round(extrapolation)}× further than the evidence — the formula will give a number for it, but nobody runs a ${target.label.toLowerCase()} off a distance this short without the training to match.`;
  }
  if (confidence === 'stretch') {
    return `${from}${stale}. Old evidence, so treat this as where you were rather than where you are.`;
  }
  if (extrapolation > 2.5) {
    return `${from}${stale}. A fair stretch beyond the evidence, and it assumes you have put in the long runs.`;
  }
  return `${from}${stale}. Close enough in distance that this is a reasonable estimate — on a flat course, on a good day.`;
}

export const PREDICTIONS_CAVEAT =
  'These come from one formula applied to your fastest efforts. It assumes you have actually trained for the distance, and it knows nothing about the course, the weather, or the day. Treat a prediction as a starting pace to argue with, not a time to chase.';

/**
 * A target race and how far away it is — the thing a prediction is actually
 * for.
 */
export interface RaceGoal {
  id: string;
  name: string;
  date: ISODate;
  targetKey: string;
  /** The time they are after, in seconds. Optional — some races are just races. */
  goalSeconds?: number;
}

export interface GoalReading {
  goal: RaceGoal;
  daysAway: number;
  prediction: Prediction | null;
  /** Seconds between the prediction and the goal. Negative means ahead of it. */
  gap: number | null;
  headline: string;
}

export function readGoal(goal: RaceGoal, predictions: Prediction[], today: ISODate = todayISO()): GoalReading {
  const daysAway = daysBetweenDates(today, goal.date);
  const prediction = predictions.find((p) => p.target.key === goal.targetKey) ?? null;
  const gap = prediction && goal.goalSeconds ? prediction.seconds - goal.goalSeconds : null;

  let headline: string;
  if (daysAway < 0) headline = `${goal.name} has been and gone.`;
  else if (!prediction) headline = `${goal.name} in ${daysAway} days. Nothing logged yet to predict from.`;
  else if (gap == null) headline = `${goal.name} in ${daysAway} days. Current shape says ${formatDuration(prediction.seconds)}.`;
  else if (gap <= 0) headline = `${goal.name} in ${daysAway} days, and your current shape is ${formatDuration(-gap)} inside your goal.`;
  else headline = `${goal.name} in ${daysAway} days. ${formatDuration(gap)} of work between here and your goal.`;

  return { goal, daysAway, prediction, gap, headline };
}
