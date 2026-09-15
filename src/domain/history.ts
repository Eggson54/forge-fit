import type { Workout } from './types';

/**
 * Exercise ids you have actually trained, most recently first and each listed
 * once. The library is 60-odd exercises deep but any given person rotates
 * through a handful, so this is what the picker should offer first.
 */
export function recentExerciseIds(workouts: Workout[], limit = 8): string[] {
  const sorted = [...workouts]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of sorted) {
    for (const ex of w.exercises) {
      if (seen.has(ex.exerciseId)) continue;
      seen.add(ex.exerciseId);
      out.push(ex.exerciseId);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
