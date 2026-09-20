import {
  LIFT_STANDARDS,
  STRENGTH_LEVELS,
  defaultColumn,
  gradeLift,
  summariseStandards,
  type LiftStandard,
} from '../domain/standards';

const lift = (id: string): LiftStandard => LIFT_STANDARDS.find((l) => l.exerciseId === id)!;

describe('the bands themselves', () => {
  it('rise monotonically in every column of every lift', () => {
    for (const l of LIFT_STANDARDS) {
      for (const column of ['male', 'female'] as const) {
        const values = STRENGTH_LEVELS.map((level) => l.thresholds[column][level]);
        for (let i = 1; i < values.length; i++) {
          expect(values[i]!).toBeGreaterThan(values[i - 1]!);
        }
      }
    }
  });

  it('covers a lift for every major movement pattern', () => {
    const ids = LIFT_STANDARDS.map((l) => l.exerciseId);
    expect(ids).toEqual(
      expect.arrayContaining(['barbell_squat', 'barbell_bench_press', 'deadlift', 'overhead_press']),
    );
  });
});

describe('gradeLift', () => {
  it('places a lift in the band its ratio falls in', () => {
    // 100 kg bench at 80 kg bodyweight is 1.25× — exactly the intermediate floor.
    const r = gradeLift(lift('barbell_bench_press'), 100, 80, 'male')!;
    expect(r.ratio).toBe(1.25);
    expect(r.level).toBe('intermediate');
    expect(r.nextLevel).toBe('advanced');
  });

  it('counts bodyweight into a lift that moves it', () => {
    // A clean bodyweight pull-up is 0 kg added, and must not read as untrained.
    const r = gradeLift(lift('pull_up'), 0.1, 80, 'male')!;
    expect(r.ratio).toBeCloseTo(1.0, 1);
    expect(r.level).toBe('novice');
  });

  it('does not count bodyweight into a lift that does not move it', () => {
    const r = gradeLift(lift('barbell_bench_press'), 80, 80, 'male')!;
    expect(r.ratio).toBe(1);
  });

  it('says how many kilos the next band costs', () => {
    // Advanced bench is 1.75×; at 80 kg that is 140 kg, so 40 kg away from 100.
    const r = gradeLift(lift('barbell_bench_press'), 100, 80, 'male')!;
    expect(r.toNextKg).toBe(40);
  });

  it('tops out cleanly instead of inventing a band above elite', () => {
    const r = gradeLift(lift('deadlift'), 400, 80, 'male')!;
    expect(r.level).toBe('elite');
    expect(r.nextLevel).toBeNull();
    expect(r.toNextKg).toBeNull();
    expect(r.progress).toBe(1);
  });

  it('measures progress from zero below the untrained floor rather than from a floor not reached', () => {
    const r = gradeLift(lift('deadlift'), 20, 80, 'male')!;
    expect(r.level).toBe('untrained');
    expect(r.progress).toBeGreaterThan(0);
    expect(r.progress).toBeLessThan(1);
  });

  it('keeps progress inside the band', () => {
    for (const l of LIFT_STANDARDS) {
      for (const kg of [0.5, 20, 60, 100, 180, 320]) {
        const r = gradeLift(l, kg, 80, 'female')!;
        expect(r.progress).toBeGreaterThanOrEqual(0);
        expect(r.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it('refuses to grade without a bodyweight rather than assuming one', () => {
    expect(gradeLift(lift('deadlift'), 180, null, 'male')).toBeNull();
    expect(gradeLift(lift('deadlift'), 180, 0, 'male')).toBeNull();
  });

  it('refuses to grade a lift with nothing logged', () => {
    expect(gradeLift(lift('deadlift'), 0, 80, 'male')).toBeNull();
    expect(gradeLift(lift('deadlift'), NaN, 80, 'male')).toBeNull();
  });

  it('reads the column it is given, not one it inferred', () => {
    const male = gradeLift(lift('barbell_squat'), 120, 70, 'male')!;
    const female = gradeLift(lift('barbell_squat'), 120, 70, 'female')!;
    expect(female.level).not.toBe(male.level);
    expect(STRENGTH_LEVELS.indexOf(female.level)).toBeGreaterThan(STRENGTH_LEVELS.indexOf(male.level));
  });
});

describe('summariseStandards', () => {
  const best = (map: Record<string, number>) => (id: string) => map[id] ?? 0;

  it('separates graded lifts from ones with nothing logged', () => {
    const s = summariseStandards(best({ deadlift: 180, barbell_bench_press: 100 }), 80, 'male');
    expect(s.results.map((r) => r.lift.exerciseId).sort()).toEqual(['barbell_bench_press', 'deadlift']);
    expect(s.missing.length).toBe(LIFT_STANDARDS.length - 2);
  });

  it('withholds an overall level until more than one lift is graded', () => {
    expect(summariseStandards(best({ deadlift: 180 }), 80, 'male').overall).toBeNull();
    expect(summariseStandards(best({}), 80, 'male').overall).toBeNull();
  });

  it('takes the median so one strong lift does not promote the rest', () => {
    const s = summariseStandards(
      // Elite deadlift, untrained everything else that is logged.
      best({ deadlift: 400, barbell_bench_press: 40, barbell_squat: 60 }),
      80,
      'male',
    );
    expect(s.overall).toBe('untrained');
  });

  it('rounds the median down on an even count rather than up', () => {
    const s = summariseStandards(best({ deadlift: 400, barbell_bench_press: 40 }), 80, 'male');
    expect(s.overall).toBe('untrained');
  });

  it('grades nothing without a bodyweight', () => {
    const s = summariseStandards(best({ deadlift: 180 }), null, 'male');
    expect(s.results).toHaveLength(0);
    expect(s.missing).toHaveLength(LIFT_STANDARDS.length);
    expect(s.overall).toBeNull();
  });
});

describe('defaultColumn', () => {
  it('preselects from the profile without locking the choice', () => {
    expect(defaultColumn('female')).toBe('female');
    expect(defaultColumn('male')).toBe('male');
  });

  it('picks something usable when sex was not given', () => {
    expect(['male', 'female']).toContain(defaultColumn('prefer_not_say'));
    expect(['male', 'female']).toContain(defaultColumn('other'));
  });
});
