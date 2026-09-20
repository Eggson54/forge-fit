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
  // Rounded on the way in. A smoothed average or a fitted weekly rate arrives
  // as 470.43000000000001, and nobody sleeps to the fourteenth decimal.
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
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

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A bare YYYY-MM-DD is a calendar date, not an instant. Parsing it directly
 * reads it as UTC midnight, which lands on the previous day anywhere west of
 * Greenwich; a full timestamp is an instant and converts to local normally.
 */
function toLocalDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

/** "Sep 14" */
export function formatDayMonth(value: string): string {
  const d = toLocalDate(value);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "Sep 14, 2026" */
export function formatDateLong(value: string): string {
  const d = toLocalDate(value);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Mon, Sep 14" */
export function formatDateWithWeekday(value: string): string {
  const d = toLocalDate(value);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetweenDates(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);
}

/**
 * Parses a duration a person would actually type for a night's sleep.
 *
 * Accepts "7:35", "7h35", "7h 35m", "7.5", "7.5h" and a bare "455". The
 * ambiguous case is a bare small number: nobody sleeps eight minutes, so a
 * bare value at or under 24 is read as hours and anything larger as minutes.
 * Returns null for anything it cannot make sense of, rather than guessing.
 */
export function parseDurationMinutes(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  // 7:35
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (colon) {
    const m = Number(colon[2]);
    if (m > 59) return null;
    return Number(colon[1]) * 60 + m;
  }

  // 7h35, 7h35m, 7h
  const hm = /^(\d{1,2})h(?:(\d{1,2})m?)?$/.exec(s);
  if (hm) {
    const m = hm[2] ? Number(hm[2]) : 0;
    if (m > 59) return null;
    return Number(hm[1]) * 60 + m;
  }

  // 45m
  const mOnly = /^(\d{1,4})m$/.exec(s);
  if (mOnly) return Number(mOnly[1]);

  // 7.5 or 7.5h
  const decimal = /^(\d{1,2}(?:\.\d+)?)h?$/.exec(s);
  if (decimal && (s.includes('.') || s.endsWith('h'))) {
    return Math.round(Number(decimal[1]) * 60);
  }

  const bare = Number(s);
  if (!Number.isFinite(bare) || bare < 0) return null;
  return bare <= 24 ? Math.round(bare * 60) : Math.round(bare);
}
