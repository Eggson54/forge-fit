import { EXERCISE_LIBRARY, MUSCLE_GROUPS, exerciseById } from '../data/exercises';
import { searchEntries, type SearchEntry } from '../domain/search';
import { substitutesFor } from '../domain/tracking';
import type { Equipment, MuscleGroup } from '../domain/types';

describe('exercise library integrity', () => {
  it('has no duplicate ids or names', () => {
    const ids = EXERCISE_LIBRARY.map((e) => e.id);
    const names = EXERCISE_LIBRARY.map((e) => e.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every exercise is complete enough to render', () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(e.id).toMatch(/^[a-z0-9_]+$/);
      expect(e.name.length).toBeGreaterThan(2);
      expect(MUSCLE_GROUPS).toContain(e.primaryMuscle);
      // A card with one cue is not instructions.
      expect(e.instructions.length).toBeGreaterThanOrEqual(3);
      for (const line of e.instructions) expect(line.trim().length).toBeGreaterThan(8);
    }
  });

  it('secondary muscles are real muscles, and never repeat the primary', () => {
    for (const e of EXERCISE_LIBRARY) {
      for (const m of e.secondaryMuscles) {
        expect(MUSCLE_GROUPS).toContain(m);
        expect(m).not.toBe(e.primaryMuscle);
      }
      expect(new Set(e.secondaryMuscles).size).toBe(e.secondaryMuscles.length);
    }
  });

  it('exerciseById resolves every entry', () => {
    for (const e of EXERCISE_LIBRARY) expect(exerciseById(e.id)?.name).toBe(e.name);
    expect(exerciseById('not_a_real_lift')).toBeUndefined();
  });

  it('covers every muscle group with something trainable', () => {
    const covered = new Set(EXERCISE_LIBRARY.map((e) => e.primaryMuscle));
    for (const m of MUSCLE_GROUPS) {
      expect(covered.has(m as MuscleGroup)).toBe(true);
    }
  });

  it('covers every equipment type, so an equipment filter is never empty', () => {
    const kinds: Equipment[] = ['bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'machines', 'cables', 'bands'];
    for (const k of kinds) {
      expect(EXERCISE_LIBRARY.filter((e) => e.equipment === k).length).toBeGreaterThan(0);
    }
  });

  it('gives a bodyweight-only user a full session, not just push-ups', () => {
    const bw = EXERCISE_LIBRARY.filter((e) => e.equipment === 'bodyweight');
    const muscles = new Set(bw.map((e) => e.primaryMuscle));
    // Push, pull, legs and core all reachable with no equipment at all.
    for (const m of ['chest', 'back', 'quads', 'core'] as MuscleGroup[]) {
      expect(muscles.has(m)).toBe(true);
    }
  });

  it('holds and carries are tracked by time, never by reps', () => {
    for (const e of EXERCISE_LIBRARY) {
      if (/plank|carry|rope|climber/i.test(e.name)) {
        expect(e.tracking).toBe('duration');
      }
    }
  });

  it('every lift has at least one substitute in the same room', () => {
    // A swap screen that comes back empty is worse than no swap screen.
    const fullGym: Equipment[] = ['barbell', 'dumbbells', 'machines', 'cables', 'bodyweight', 'kettlebell', 'bands'];
    for (const e of EXERCISE_LIBRARY) {
      const subs = substitutesFor(e, EXERCISE_LIBRARY, fullGym, 5);
      expect(subs.length).toBeGreaterThan(0);
      expect(subs.map((s) => s.id)).not.toContain(e.id);
    }
  });
});

describe('the library through search', () => {
  const entries: SearchEntry[] = EXERCISE_LIBRARY.map((e) => ({
    id: e.id,
    kind: 'exercise',
    title: e.name,
    subtitle: `${e.primaryMuscle} ${e.equipment}`,
    keywords: e.secondaryMuscles,
    href: `/exercise/${e.id}`,
  }));

  it('finds a reasonable spread for common muscle searches', () => {
    for (const [q, least] of [['chest', 5], ['back', 6], ['shoulders', 5], ['core', 6]] as const) {
      expect(searchEntries(q, entries, 99).length).toBeGreaterThanOrEqual(least);
    }
  });

  it('finds specific lifts by their everyday names', () => {
    for (const q of ['bench', 'squat', 'curl', 'row', 'deadlift', 'plank', 'dip']) {
      expect(searchEntries(q, entries, 99).length).toBeGreaterThan(0);
    }
  });
});
