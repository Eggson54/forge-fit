import { exerciseCandidates } from '../domain/exerciseCandidates';
import { EXERCISE_LIBRARY } from '../data/exercises';

describe('exerciseCandidates', () => {
  it('only offers exercises the athlete has the equipment for', () => {
    const got = exerciseCandidates(['dumbbells'], EXERCISE_LIBRARY);
    for (const c of got) {
      const e = EXERCISE_LIBRARY.find((x) => x.id === c.id)!;
      expect(['dumbbells', 'bodyweight']).toContain(e.equipment);
    }
    expect(got.length).toBeGreaterThan(0);
  });

  it('always includes bodyweight work', () => {
    const got = exerciseCandidates([], EXERCISE_LIBRARY);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((c) => EXERCISE_LIBRARY.find((x) => x.id === c.id)!.equipment === 'bodyweight')).toBe(true);
  });

  it('offers everything for a full gym', () => {
    const builtIn = EXERCISE_LIBRARY.filter((e) => !e.isCustom);
    expect(exerciseCandidates(['full_gym'], EXERCISE_LIBRARY)).toHaveLength(builtIn.length);
  });

  it('only ever offers ids that exist in the library', () => {
    const ids = new Set(EXERCISE_LIBRARY.map((e) => e.id));
    for (const c of exerciseCandidates(['full_gym'], EXERCISE_LIBRARY)) expect(ids.has(c.id)).toBe(true);
  });

  it('stays small enough to send with every request', () => {
    expect(JSON.stringify(exerciseCandidates(['full_gym'], EXERCISE_LIBRARY)).length).toBeLessThan(12_000);
  });
});
