import { addDaysISO, daysBetweenDates } from './date';
import type { ISODate, MuscleGroup } from './types';

export interface ProgramExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: MuscleGroup;
  sets: number;
  targetReps: number;
  restSeconds: number;
  supersetGroup?: string;
}

export interface ProgramDay {
  /** 1-based position within the week. */
  index: number;
  name: string;
  focus: MuscleGroup[];
  exercises: ProgramExercise[];
}

export interface Program {
  id: string;
  name: string;
  summary: string;
  /** Total weeks before the plan repeats or ends. */
  weeks: number;
  daysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
  /**
   * Percentage added to working weights each week, applied by the UI as a
   * suggestion the athlete can override. Deliberately small: a plan that
   * promises 5% a week for eight weeks is selling something.
   */
  weeklyProgressionPct: number;
  days: ProgramDay[];
}

export interface ProgramEnrolment {
  programId: string;
  startedOn: ISODate;
  /** ISO dates of the sessions completed, so a missed day does not lose the place. */
  completedDates: ISODate[];
  /** Day indices completed, in order, parallel to completedDates. */
  completedDayIndices: number[];
}

export interface ProgramPosition {
  /** 1-based. */
  week: number;
  /** The day that comes next, or null once the plan is finished. */
  day: ProgramDay | null;
  /** Sessions done out of the whole plan. */
  sessionsDone: number;
  sessionsTotal: number;
  finished: boolean;
}

/**
 * Where the athlete is in a plan.
 *
 * Position is counted from sessions *completed*, not from the calendar. A plan
 * driven by elapsed days punishes a missed Tuesday by marking it failed and
 * moving on; counting sessions means life can happen and the plan simply waits.
 * The week number is derived from the same count so it never runs ahead of the
 * work actually done.
 */
export function programPosition(program: Program, enrolment: ProgramEnrolment): ProgramPosition {
  const sessionsTotal = program.weeks * program.daysPerWeek;
  const sessionsDone = Math.min(enrolment.completedDates.length, sessionsTotal);
  const finished = sessionsDone >= sessionsTotal;

  return {
    week: Math.min(program.weeks, Math.floor(sessionsDone / program.daysPerWeek) + 1),
    day: finished ? null : (program.days[sessionsDone % program.daysPerWeek] ?? null),
    sessionsDone,
    sessionsTotal,
    finished,
  };
}

/**
 * Suggested multiplier on a day's working weights for the current week.
 *
 * Week one is 1.0 — the plan starts from what the athlete already lifts rather
 * than from a number the app invented.
 */
export function weekMultiplier(program: Program, week: number): number {
  const steps = Math.max(0, week - 1);
  return Math.round((1 + (program.weeklyProgressionPct / 100) * steps) * 1000) / 1000;
}

/**
 * Whether the plan has gone stale. Not a judgement — the UI uses it to offer a
 * restart rather than leaving a three-month-old plan looking current.
 */
export function isStale(enrolment: ProgramEnrolment, today: ISODate, idleDays = 21): boolean {
  const last = enrolment.completedDates[enrolment.completedDates.length - 1] ?? enrolment.startedOn;
  return daysBetweenDates(last, today) >= idleDays;
}

/** Dates the next `count` sessions would land on at the plan's own cadence. */
export function projectedDates(program: Program, from: ISODate, count: number): ISODate[] {
  // Spread sessions evenly across the week rather than stacking them: a
  // four-day plan run on four consecutive days is not the plan.
  const gap = Math.max(1, Math.round(7 / program.daysPerWeek));
  return Array.from({ length: count }, (_, i) => addDaysISO(from, i * gap));
}
