import type { Workout } from './types';

/**
 * What you were doing on this date before.
 *
 * Not a metric — a memory. The point is the recall, so the rule is strict: it
 * only ever looks at the same calendar day in a previous year or the same day
 * a whole number of months back. "Something roughly like this, some time ago"
 * is not a memory, it is a search result.
 */
export interface Recollection {
  workout: Workout;
  /** How long ago, in plain words. */
  ago: string;
  /** Months back, or 12/24/… for years. */
  monthsAgo: number;
}

function monthsBetween(from: string, to: string): number | null {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (a.getDate() !== b.getDate()) return null;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function phrase(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? 'A year ago today' : `${years} years ago today`;
  }
  return months === 1 ? 'A month ago today' : `${months} months ago today`;
}

/**
 * Sessions from the same calendar day, most recent first.
 *
 * `minMonths` keeps last month's session out of it: the whole appeal is
 * distance, and "you trained 30 days ago" is not a recollection.
 */
export function onThisDay(workouts: Workout[], today: string, minMonths = 3): Recollection[] {
  const out: Recollection[] = [];
  for (const w of workouts) {
    if (w.status !== 'completed') continue;
    const date = (w.completedAt ?? w.date).slice(0, 10);
    if (date >= today) continue;
    const months = monthsBetween(date, today);
    if (months == null || months < minMonths) continue;
    out.push({ workout: w, ago: phrase(months), monthsAgo: months });
  }
  return out.sort((a, b) => a.monthsAgo - b.monthsAgo);
}
