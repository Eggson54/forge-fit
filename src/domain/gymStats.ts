import type { Workout } from './types';
import { isWarmupSet } from './sets';

/**
 * Where the training actually happened.
 *
 * A session can carry the gym it was logged at, which turns the Iron Map from
 * a collection sitting beside the log into something the log can be read
 * through: which room you get your best work done in, and which one you
 * actually go to.
 */
export interface GymSessions {
  gymId: string;
  gymName: string;
  sessions: number;
  sets: number;
  /** ISO date of the most recent session there. */
  lastVisit: string;
  /** Share of all located sessions, 0–1. */
  share: number;
}

function workingSets(w: Workout): number {
  let n = 0;
  for (const ex of w.exercises) for (const s of ex.sets) if (s.completed && !isWarmupSet(s)) n += 1;
  return n;
}

/**
 * Sessions grouped by gym, busiest first. Workouts with no gym attached are
 * left out rather than bucketed as "unknown": the question is where you train,
 * and a session logged before this existed is not evidence of anywhere.
 */
export function sessionsByGym(workouts: Workout[]): GymSessions[] {
  const byId = new Map<string, GymSessions>();
  let located = 0;

  for (const w of workouts) {
    if (w.status !== 'completed' || !w.gym) continue;
    located += 1;
    const existing = byId.get(w.gym.id);
    const date = w.completedAt ?? w.date;
    if (existing) {
      existing.sessions += 1;
      existing.sets += workingSets(w);
      if (date > existing.lastVisit) existing.lastVisit = date;
      // The name travels with the workout, so a renamed venue wins on recency.
      if (date >= existing.lastVisit) existing.gymName = w.gym.name;
    } else {
      byId.set(w.gym.id, {
        gymId: w.gym.id,
        gymName: w.gym.name,
        sessions: 1,
        sets: workingSets(w),
        lastVisit: date,
        share: 0,
      });
    }
  }

  const rows = [...byId.values()];
  for (const r of rows) r.share = located > 0 ? r.sessions / located : 0;
  rows.sort((a, b) => b.sessions - a.sessions || (a.lastVisit < b.lastVisit ? 1 : -1));
  return rows;
}

/**
 * The gym you train in most, once there is enough to call it that.
 *
 * Two sessions is not a home gym, and neither is a dead heat — naming one
 * arbitrarily would be the app asserting something it cannot see.
 */
export function homeGym(workouts: Workout[], minSessions = 3): GymSessions | null {
  const rows = sessionsByGym(workouts);
  const top = rows[0];
  if (!top || top.sessions < minSessions) return null;
  if (rows[1] && rows[1].sessions === top.sessions) return null;
  return top;
}

/** How many completed sessions have a gym attached at all. */
export function locatedSessionCount(workouts: Workout[]): number {
  return workouts.filter((w) => w.status === 'completed' && w.gym).length;
}
