import type { ISODate } from './types';

/** Local calendar date as YYYY-MM-DD (no timezone surprises). */
export function todayISO(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(date: ISODate, delta: number): ISODate {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return todayISO(d);
}

export function timeOfDay(d: Date = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

export function weekdayIndex(date: ISODate): number {
  return new Date(`${date}T00:00:00`).getDay();
}

/** Last 7 ISO dates ending today (oldest first). */
export function lastNDays(n: number, end: ISODate = todayISO()): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDaysISO(end, -(n - 1 - i)));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Duration for summaries, where trailing seconds are noise: a finished session
 * reads "52m", not "52m 0s". Live timers keep using formatDuration.
 */
export function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.max(0, Math.round(seconds))}s`;
}

export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  return `${m}m`;
}

/** Longest run of consecutive trained days inside the given date set. */
export function longestRunOfDays(dates: Set<ISODate>): number {
  let best = 0;
  for (const date of dates) {
    // Only count from the start of a run, so each run is walked once.
    const prev = new Date(`${date}T00:00:00`);
    prev.setDate(prev.getDate() - 1);
    if (dates.has(todayISO(prev))) continue;
    let run = 0;
    const cursor = new Date(`${date}T00:00:00`);
    while (dates.has(todayISO(cursor))) {
      run += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    best = Math.max(best, run);
  }
  return best;
}
