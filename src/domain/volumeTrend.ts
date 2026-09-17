import type { Workout } from './types';
import { isWarmupSet } from './sets';

/**
 * Week-over-week training load, used to answer two questions the app was
 * previously silent on: is the volume actually going up, and has it been going
 * up for so long that a lighter week is overdue?
 *
 * "Load" here is working sets, not tonnage. Tonnage swings with which lifts you
 * happened to pick — a leg day outweighs an arm day by a factor of three — so a
 * tonnage chart mostly measures exercise selection. Set counts are the unit
 * programmes are actually written in.
 */

export interface VolumeWeek {
  /** ISO date of the Monday that starts the week. */
  weekStart: string;
  sets: number;
  workouts: number;
}

/** Monday-anchored week start for a local date. */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const dow = d.getDay(); // 0 = Sunday
  const backToMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - backToMonday);
  return d.toISOString().slice(0, 10);
}

function workingSets(w: Workout): number {
  let n = 0;
  for (const ex of w.exercises) {
    for (const s of ex.sets) if (s.completed && !isWarmupSet(s)) n += 1;
  }
  return n;
}

/**
 * Consecutive weeks ending with the week containing `today`, oldest first.
 * Gaps are filled with zeroes: a week off is a real data point, and dropping it
 * would let a two-week layoff read as "no change".
 */
export function weeklyVolumeSeries(workouts: Workout[], today: string, weeks = 8): VolumeWeek[] {
  const buckets = new Map<string, { sets: number; workouts: number }>();
  for (const w of workouts) {
    if (!w.completedAt) continue;
    const key = weekStartOf(w.completedAt);
    const b = buckets.get(key) ?? { sets: 0, workouts: 0 };
    b.sets += workingSets(w);
    b.workouts += 1;
    buckets.set(key, b);
  }

  const out: VolumeWeek[] = [];
  const cursor = new Date(`${weekStartOf(today)}T00:00:00`);
  cursor.setDate(cursor.getDate() - 7 * (weeks - 1));
  for (let i = 0; i < weeks; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    const b = buckets.get(key);
    out.push({ weekStart: key, sets: b?.sets ?? 0, workouts: b?.workouts ?? 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export type LoadVerdict = 'building' | 'holding' | 'backing_off' | 'deload_due' | 'ramping_fast' | 'idle';

export interface LoadReading {
  verdict: LoadVerdict;
  thisWeek: number;
  lastWeek: number;
  /** Percent change vs last week, null when last week was empty. */
  changePct: number | null;
  /** Consecutive weeks at or above the previous week, counting back from the last full week. */
  buildingWeeks: number;
  headline: string;
  detail: string;
}

/**
 * The reading deliberately looks at the last *complete* week for the ramp
 * count. Judging a Tuesday against a finished week always reads as a collapse,
 * which is how a half-finished week ends up telling someone to train harder.
 */
export function readLoad(series: VolumeWeek[]): LoadReading {
  const n = series.length;
  const thisWeek = n > 0 ? series[n - 1].sets : 0;
  const lastWeek = n > 1 ? series[n - 2].sets : 0;
  const changePct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : null;

  // Count the build streak over completed weeks only (everything but the last).
  let buildingWeeks = 0;
  for (let i = n - 2; i > 0; i -= 1) {
    if (series[i].sets > 0 && series[i].sets >= series[i - 1].sets) buildingWeeks += 1;
    else break;
  }

  const recent = series.slice(-4);
  const trained = recent.reduce((a, w) => a + w.workouts, 0);
  if (trained === 0) {
    return {
      verdict: 'idle',
      thisWeek,
      lastWeek,
      changePct,
      buildingWeeks,
      headline: 'No load to read',
      detail: 'Log a few sessions and this will start tracking how your weekly volume moves.',
    };
  }

  if (buildingWeeks >= 4) {
    return {
      verdict: 'deload_due',
      thisWeek,
      lastWeek,
      changePct,
      buildingWeeks,
      headline: `${buildingWeeks} weeks without a lighter one`,
      detail: 'Volume has climbed or held for a month straight. Many programmes drop to roughly half sets for a week here.',
    };
  }

  if (changePct !== null && changePct >= 30 && lastWeek >= 6) {
    return {
      verdict: 'ramping_fast',
      thisWeek,
      lastWeek,
      changePct,
      buildingWeeks,
      headline: `Up ${Math.round(changePct)}% on last week`,
      detail: 'That is a steep jump. Big single-week increases tend to show up as soreness and missed sessions later.',
    };
  }

  if (changePct === null || Math.abs(changePct) < 10) {
    return {
      verdict: 'holding',
      thisWeek,
      lastWeek,
      changePct,
      buildingWeeks,
      headline: 'Holding steady',
      detail: `${thisWeek} working sets this week, about the same as last.`,
    };
  }

  if (changePct > 0) {
    return {
      verdict: 'building',
      thisWeek,
      lastWeek,
      changePct,
      buildingWeeks,
      headline: `Up ${Math.round(changePct)}% on last week`,
      detail: `${thisWeek} working sets, against ${lastWeek} last week.`,
    };
  }

  return {
    verdict: 'backing_off',
    thisWeek,
    lastWeek,
    changePct,
    buildingWeeks,
    headline: `Down ${Math.abs(Math.round(changePct))}% on last week`,
    detail: `${thisWeek} working sets, against ${lastWeek} last week. Fine if it is deliberate.`,
  };
}
