import type { Workout } from './types';
import { isWarmupSet } from './sets';
import { weekStartOf } from './volumeTrend';

/**
 * The long view: a year of training as a grid, and the totals underneath it.
 *
 * Every other screen answers "how is this week going". None of them show the
 * shape of a year — the months that went well, the fortnight that vanished,
 * the fact that you have simply kept turning up.
 */

export interface TrainingDay {
  date: string;
  sessions: number;
  sets: number;
  /** 0–4. 0 is a rest day; the rest are quartiles of the year's set counts. */
  level: number;
}

function workingSets(w: Workout): number {
  let n = 0;
  for (const ex of w.exercises) for (const s of ex.sets) if (s.completed && !isWarmupSet(s)) n += 1;
  return n;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/**
 * Levels are quantiles of *this athlete's own* days, not fixed thresholds.
 *
 * A fixed scale flatters a high-volume lifter into a solid block and leaves a
 * beginner's grid permanently pale, which tells neither of them anything. The
 * question the grid answers is "how does this day compare to my other days".
 */
function levelsFor(setCounts: number[]): (sets: number) => number {
  const trained = setCounts.filter((n) => n > 0).sort((a, b) => a - b);
  if (trained.length === 0) return () => 0;

  // With no variation there is nothing to grade, and a day you trained should
  // never render faint.
  if (trained[0] === trained[trained.length - 1]) return (sets) => (sets > 0 ? 4 : 0);

  // Ranked by how many days were strictly lighter, rather than compared against
  // quantile *values*. Comparing with <= against a quantile that equals the
  // maximum meant the busiest day in the year could never reach the top level.
  return (sets: number) => {
    if (sets <= 0) return 0;
    let lighter = 0;
    for (const n of trained) {
      if (n < sets) lighter += 1;
      else break;
    }
    return 1 + Math.min(3, Math.floor((lighter / trained.length) * 4));
  };
}

export interface TrainingGrid {
  /** Columns of seven days, oldest first. Each column starts on a Monday. */
  weeks: TrainingDay[][];
  /** Month label for each column, or null when it repeats the one before. */
  monthLabels: (string | null)[];
  from: string;
  to: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A Monday-aligned grid ending on the week containing `today`.
 *
 * Days after today are still emitted, with zero sessions, so the final column
 * is a full week rather than a ragged edge — a half-drawn last column reads as
 * a rendering bug, not as "the week is not over".
 */
export function trainingGrid(workouts: Workout[], today: string, weeks = 53): TrainingGrid {
  const byDate = new Map<string, { sessions: number; sets: number }>();
  for (const w of workouts) {
    if (w.status !== 'completed') continue;
    const date = (w.completedAt ?? w.date).slice(0, 10);
    const entry = byDate.get(date) ?? { sessions: 0, sets: 0 };
    entry.sessions += 1;
    entry.sets += workingSets(w);
    byDate.set(date, entry);
  }

  const lastMonday = weekStartOf(today);
  const start = addDays(lastMonday, -7 * (weeks - 1));

  const columns: TrainingDay[][] = [];
  const raw: number[] = [];
  for (let w = 0; w < weeks; w += 1) {
    const column: TrainingDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(start, w * 7 + d);
      const hit = byDate.get(date);
      column.push({ date, sessions: hit?.sessions ?? 0, sets: hit?.sets ?? 0, level: 0 });
      raw.push(hit?.sets ?? 0);
    }
    columns.push(column);
  }

  const level = levelsFor(raw);
  for (const column of columns) for (const day of column) day.level = level(day.sets);

  let previousMonth = -1;
  const monthLabels = columns.map((column) => {
    const month = new Date(`${column[0]!.date}T00:00:00`).getMonth();
    if (month === previousMonth) return null;
    previousMonth = month;
    return MONTHS[month]!;
  });

  return {
    weeks: columns,
    monthLabels,
    from: start,
    to: columns[columns.length - 1]![6]!.date,
  };
}

export interface LifetimeStats {
  sessions: number;
  sets: number;
  reps: number;
  /** Kilograms moved across every completed set, warm-ups included. */
  volumeKg: number;
  hours: number;
  /** Distinct days trained, which is not the same as sessions. */
  days: number;
  /** Longest run of consecutive days with at least one session. */
  longestRun: number;
  firstSession: string | null;
  /** Distinct exercises ever logged. */
  exercises: number;
}

/**
 * Totals over everything ever logged.
 *
 * Volume includes warm-up sets here, unlike the weekly load reading. Two
 * different questions: "how much work counts towards adaptation" wants working
 * sets only, and "how much have I moved in my life" wants the lot.
 */
export function lifetimeStats(workouts: Workout[]): LifetimeStats {
  const completed = workouts.filter((w) => w.status === 'completed');
  const days = new Set<string>();
  const exercises = new Set<string>();
  let sets = 0;
  let reps = 0;
  let volumeKg = 0;
  let seconds = 0;
  let first: string | null = null;

  for (const w of completed) {
    const date = (w.completedAt ?? w.date).slice(0, 10);
    days.add(date);
    if (!first || date < first) first = date;
    seconds += w.durationSeconds ?? 0;
    for (const ex of w.exercises) {
      exercises.add(ex.exerciseId);
      for (const s of ex.sets) {
        if (!s.completed) continue;
        sets += 1;
        reps += s.reps ?? 0;
        volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
    }
  }

  return {
    sessions: completed.length,
    sets,
    reps,
    volumeKg: Math.round(volumeKg),
    hours: Math.round((seconds / 3600) * 10) / 10,
    days: days.size,
    longestRun: longestRunOfDates([...days]),
    firstSession: first,
    exercises: exercises.size,
  };
}

/** Longest consecutive-day run in an unsorted list of ISO dates. */
export function longestRunOfDates(dates: string[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }
  return best;
}

export interface MonthSummary {
  /** First day of the month, ISO. */
  month: string;
  label: string;
  sessions: number;
  sets: number;
}

/** Sessions per calendar month across the grid's range, oldest first. */
export function monthlyTotals(grid: TrainingGrid): MonthSummary[] {
  const byMonth = new Map<string, MonthSummary>();
  for (const column of grid.weeks) {
    for (const day of column) {
      const month = `${day.date.slice(0, 7)}-01`;
      const existing = byMonth.get(month);
      if (existing) {
        existing.sessions += day.sessions;
        existing.sets += day.sets;
      } else {
        byMonth.set(month, {
          month,
          label: MONTHS[Number(day.date.slice(5, 7)) - 1]!,
          sessions: day.sessions,
          sets: day.sets,
        });
      }
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * The months a twelve-column chart should draw.
 *
 * A 53-week grid straddles thirteen calendar months, so plotting all of them
 * labelled the chart Sep … Sep and gave a three-day sliver of last September a
 * column of its own — which then read as a month of barely training. Taking
 * the most recent twelve drops the sliver and makes the names unique by
 * construction.
 */
export function chartMonths(grid: TrainingGrid, count = 12): MonthSummary[] {
  return monthlyTotals(grid).slice(-count);
}
