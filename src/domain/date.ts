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

export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
