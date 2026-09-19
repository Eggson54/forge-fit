import {
  compareSessions,
  findPreviousSession,
  summariseComparison,
  STRENGTH_NOISE_PCT,
} from '../domain/sessionCompare';
import type { SetEntry, Workout } from '../domain/types';

const set = (weightKg: number, reps: number, over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg,
  reps,
  rpe: null,
  completed: true,
  ...over,
});

const workout = (
  name: string,
  date: string,
  exercises: { id: string; name: string; sets: SetEntry[] }[],
): Workout =>
  ({
    id: `w_${name}_${date}`,
    name,
    date,
    completedAt: `${date}T18:00:00.000Z`,
    status: 'completed',
    exercises: exercises.map((e) => ({
      id: `we_${e.id}_${date}`,
      exerciseId: e.id,
      name: e.name,
      primaryMuscle: 'chest',
      restSeconds: 120,
      sets: e.sets,
    })),
  }) as unknown as Workout;

const push = (date: string, benchKg: number) =>
  workout('Push', date, [
    { id: 'bench', name: 'Bench', sets: [set(benchKg, 5), set(benchKg, 5)] },
    { id: 'ohp', name: 'Overhead Press', sets: [set(50, 8)] },
  ]);

describe('findPreviousSession', () => {
  it('prefers a session with the same name', () => {
    const history = [push('2026-09-01', 90), workout('Legs', '2026-09-05', [{ id: 'squat', name: 'Squat', sets: [set(120, 5)] }])];
    const found = findPreviousSession(history, push('2026-09-10', 95));
    expect(found?.match).toBe('same_name');
    expect(found?.workout.date).toBe('2026-09-01');
  });

  it('takes the most recent match, not the first one it finds', () => {
    const history = [push('2026-09-01', 80), push('2026-09-08', 90)];
    expect(findPreviousSession(history, push('2026-09-15', 95))?.workout.date).toBe('2026-09-08');
  });

  it('falls back to a session sharing most of the same lifts', () => {
    const current = workout('Untitled', '2026-09-10', [
      { id: 'bench', name: 'Bench', sets: [set(90, 5)] },
      { id: 'ohp', name: 'OHP', sets: [set(50, 8)] },
    ]);
    const found = findPreviousSession([push('2026-09-01', 85)], current);
    expect(found?.match).toBe('similar');
  });

  it('refuses a comparison built on one shared lift', () => {
    // A push day and a leg day that both contain one movement are not the same
    // session, and pretending otherwise is worse than offering nothing.
    const legs = workout('Legs', '2026-09-01', [
      { id: 'squat', name: 'Squat', sets: [set(120, 5)] },
      { id: 'rdl', name: 'RDL', sets: [set(100, 8)] },
      { id: 'bench', name: 'Bench', sets: [set(60, 10)] },
    ]);
    const current = workout('Untitled', '2026-09-10', [
      { id: 'bench', name: 'Bench', sets: [set(90, 5)] },
      { id: 'ohp', name: 'OHP', sets: [set(50, 8)] },
      { id: 'dip', name: 'Dip', sets: [set(0, 10)] },
    ]);
    expect(findPreviousSession([legs], current)).toBeNull();
  });

  it('never compares a session to itself or to the future', () => {
    const current = push('2026-09-10', 95);
    expect(findPreviousSession([current], current)).toBeNull();
    expect(findPreviousSession([push('2026-09-20', 100)], current)).toBeNull();
  });

  it('ignores sessions that were never finished', () => {
    const abandoned = { ...push('2026-09-01', 90), status: 'in_progress' } as unknown as Workout;
    expect(findPreviousSession([abandoned], push('2026-09-10', 95))).toBeNull();
  });
});

describe('compareSessions', () => {
  it('reports per-lift strength change', () => {
    const c = compareSessions(push('2026-09-10', 100), [push('2026-09-03', 90)]);
    const bench = c.exercises.find((e) => e.exerciseId === 'bench')!;
    expect(bench.strengthChangePct).toBeCloseTo(11.1, 0);
    expect(c.up).toBe(1);
    expect(c.down).toBe(0);
  });

  it('treats a change inside the noise band as holding', () => {
    // Rounding and rep choice move an estimated max by a percent on their own.
    const c = compareSessions(push('2026-09-10', 90.5), [push('2026-09-03', 90)]);
    const bench = c.exercises.find((e) => e.exerciseId === 'bench')!;
    expect(Math.abs(bench.strengthChangePct!)).toBeLessThan(STRENGTH_NOISE_PCT);
    expect(c.same).toBeGreaterThan(0);
    expect(c.up).toBe(0);
  });

  it('marks a lift that was not in the previous session', () => {
    const current = workout('Push', '2026-09-10', [
      { id: 'bench', name: 'Bench', sets: [set(90, 5)] },
      { id: 'fly', name: 'Fly', sets: [set(20, 12)] },
    ]);
    const c = compareSessions(current, [push('2026-09-03', 90)]);
    expect(c.exercises.find((e) => e.exerciseId === 'fly')!.isNew).toBe(true);
    expect(c.exercises.find((e) => e.exerciseId === 'bench')!.isNew).toBe(false);
  });

  it('lists lifts that were dropped since last time', () => {
    const current = workout('Push', '2026-09-10', [{ id: 'bench', name: 'Bench', sets: [set(90, 5)] }]);
    const c = compareSessions(current, [push('2026-09-03', 90)]);
    expect(c.dropped.map((d) => d.exerciseId)).toEqual(['ohp']);
  });

  it('totals volume and sets on both sides', () => {
    const c = compareSessions(push('2026-09-10', 100), [push('2026-09-03', 90)]);
    expect(c.totalSets).toBe(3);
    expect(c.previousTotalSets).toBe(3);
    expect(c.totalVolumeKg).toBeGreaterThan(c.previousTotalVolumeKg);
  });

  it('ignores warm-ups on both sides', () => {
    const withWarmup = workout('Push', '2026-09-10', [
      { id: 'bench', name: 'Bench', sets: [set(40, 10, { kind: 'warmup' }), set(100, 5)] },
    ]);
    const c = compareSessions(withWarmup, []);
    expect(c.exercises[0]!.sets).toBe(1);
  });

  it('degrades to an empty comparison rather than throwing', () => {
    const c = compareSessions(push('2026-09-10', 100), []);
    expect(c.match).toBe('none');
    expect(c.previous).toBeNull();
    expect(c.exercises.every((e) => e.isNew)).toBe(true);
    expect(summariseComparison(c)).toMatch(/Nothing to compare/);
  });

  it('counts bodyweight work when told how the lift is measured', () => {
    // Default lookup treats everything as loaded, which zeroes a pull-up.
    const pullups = workout('Pull', '2026-09-10', [{ id: 'pull_up', name: 'Pull-Up', sets: [set(0, 10)] }]);
    const loaded = compareSessions(pullups, [], 85);
    expect(loaded.totalVolumeKg).toBe(0);

    const aware = compareSessions(pullups, [], 85, () => 'bodyweight');
    expect(aware.totalVolumeKg).toBe(850);
  });
});

describe('summariseComparison', () => {
  it('says what happened in one line', () => {
    const better = compareSessions(push('2026-09-10', 110), [push('2026-09-03', 90)]);
    expect(summariseComparison(better)).toBe('Up on 1 lift, down on none.');

    const worse = compareSessions(push('2026-09-10', 70), [push('2026-09-03', 90)]);
    expect(summariseComparison(worse)).toBe('Down on 1 lift.');

    const flat = compareSessions(push('2026-09-10', 90), [push('2026-09-03', 90)]);
    expect(summariseComparison(flat)).toBe('Same lifts, much the same numbers.');
  });
});
