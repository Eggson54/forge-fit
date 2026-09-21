import {
  BAND_LABEL,
  loadRatio,
  READINESS_CAVEAT,
  consecutiveTrainingDays,
  hours,
  readiness,
  trailingSleepAverage,
  type ReadinessInput,
} from '../domain/readiness';
import type { SleepLog, Workout } from '../domain/types';

const TODAY = '2026-09-21';

const base: ReadinessInput = {
  sleepMinutes: 480,
  sleepTargetMinutes: 480,
  sleepAverageMinutes: 470,
  lastEffort: 3,
  consecutiveDays: 1,
  loadRatio: 1,
};

const r = (over: Partial<ReadinessInput> = {}) => readiness({ ...base, ...over })!;

const sleep = (date: string, minutes: number): SleepLog => ({ id: date, date, minutes });

const workout = (date: string): Workout => ({
  id: date,
  name: 'Session',
  status: 'completed',
  date,
  startedAt: null,
  completedAt: `${date}T19:00:00.000Z`,
  durationSeconds: 3600,
  exercises: [],
  focus: [],
});

describe('readiness', () => {
  it('reads high when everything is where it should be', () => {
    expect(r().score).toBeGreaterThanOrEqual(82);
    expect(r().band).toBe('peak');
  });

  it('falls when last night was short', () => {
    expect(r({ sleepMinutes: 300 }).score).toBeLessThan(r().score);
    expect(r({ sleepMinutes: 240 }).score).toBeLessThan(r({ sleepMinutes: 300 }).score);
  });

  it('does not keep rewarding sleep past the target', () => {
    // Ten hours is not twice as ready as eight; if it were, one lie-in would
    // paper over a bad week.
    expect(r({ sleepMinutes: 600 }).score).toBe(r({ sleepMinutes: 480 }).score);
  });

  it('charges for a hard session and barely charges for an easy one', () => {
    expect(r({ lastEffort: 5 }).score).toBeLessThan(r({ lastEffort: 1 }).score);
    // Monotonic across the whole scale, with the gap widening at the top end.
    const scores = ([1, 2, 3, 4, 5] as const).map((e) => r({ lastEffort: e }).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    expect(scores[0]! - scores[1]!).toBeLessThan(scores[3]! - scores[4]!);
  });

  it('falls as the days stack up without a rest day', () => {
    expect(r({ consecutiveDays: 2 }).score).toBe(r({ consecutiveDays: 0 }).score);
    expect(r({ consecutiveDays: 6 }).score).toBeLessThan(r({ consecutiveDays: 2 }).score);
  });

  it('treats a genuinely empty week as the lowest load reading, not as unknown', () => {
    const empty = r({ loadRatio: 0 });
    expect(empty.components.map((c) => c.key)).toContain('load');
    expect(empty.score).toBeLessThan(r({ loadRatio: 1 }).score);
  });

  it('charges for a volume spike and for detraining alike', () => {
    expect(r({ loadRatio: 1.9 }).score).toBeLessThan(r({ loadRatio: 1 }).score);
    expect(r({ loadRatio: 0.3 }).score).toBeLessThan(r({ loadRatio: 1 }).score);
    // A mild week either way is not a finding.
    expect(r({ loadRatio: 1.1 }).score).toBe(r({ loadRatio: 1 }).score);
  });

  it('drops a component it cannot see rather than scoring it zero', () => {
    const blind = r({ sleepMinutes: null, sleepAverageMinutes: null });
    expect(blind.components.map((c) => c.key)).toEqual(['effort', 'consecutive', 'load']);
    // Not knowing how you slept is not the same as sleeping badly.
    expect(blind.score).toBeGreaterThan(r({ sleepMinutes: 120, sleepAverageMinutes: 120 }).score);
  });

  it('renormalises the weights of what is left', () => {
    const blind = r({ sleepMinutes: null, sleepAverageMinutes: null });
    const total = blind.components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it('says nothing at all when it knows nothing', () => {
    expect(
      readiness({
        sleepMinutes: null,
        sleepTargetMinutes: 480,
        sleepAverageMinutes: null,
        lastEffort: null,
        consecutiveDays: null,
        loadRatio: null,
      }),
    ).toBeNull();
  });

  it('stays inside 0 and 100 at the extremes', () => {
    const worst = r({ sleepMinutes: 0, sleepAverageMinutes: 0, lastEffort: 5, consecutiveDays: 30, loadRatio: 4 });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
    expect(r().score).toBeLessThanOrEqual(100);
  });

  it('bands rise with the score and all have a label', () => {
    const bands = [
      r({ sleepMinutes: 180, lastEffort: 5, consecutiveDays: 8, loadRatio: 2 }).band,
      r({ sleepMinutes: 420, lastEffort: 4, consecutiveDays: 4 }).band,
      r({ sleepMinutes: 450 }).band,
      r().band,
    ];
    expect(bands[0]).toBe('low');
    expect(bands[3]).toBe('peak');
    for (const b of bands) expect(BAND_LABEL[b]).toBeTruthy();
  });

  it('names the weakest component instead of restating the number', () => {
    const tired = r({ sleepMinutes: 240 });
    expect(tired.headline).toMatch(/short of your target/);
    expect(tired.headline).not.toMatch(/\d\d\s*\/\s*100/);
  });

  it('says so plainly when nothing is dragging', () => {
    expect(r().headline).toMatch(/green/i);
  });
});

describe('consecutiveTrainingDays', () => {
  it('counts back from yesterday', () => {
    const days = ['2026-09-20', '2026-09-19', '2026-09-18'].map(workout);
    expect(consecutiveTrainingDays(days, TODAY)).toBe(3);
  });

  it('does not count today, so finishing a session cannot lower your own reading', () => {
    expect(consecutiveTrainingDays([workout(TODAY)], TODAY)).toBe(0);
  });

  it('stops at the first rest day', () => {
    const days = ['2026-09-20', '2026-09-18', '2026-09-17'].map(workout);
    expect(consecutiveTrainingDays(days, TODAY)).toBe(1);
  });

  it('counts two sessions on one day once', () => {
    expect(consecutiveTrainingDays([workout('2026-09-20'), workout('2026-09-20')], TODAY)).toBe(1);
  });

  it('is zero with nothing logged', () => {
    expect(consecutiveTrainingDays([], TODAY)).toBe(0);
  });
});

describe('trailingSleepAverage', () => {
  it('averages the week behind, excluding last night', () => {
    const logs = [sleep('2026-09-21', 300), sleep('2026-09-20', 480), sleep('2026-09-19', 420)];
    expect(trailingSleepAverage(logs, TODAY)).toBe(450);
  });

  it('ignores anything older than the window', () => {
    const logs = [sleep('2026-09-20', 480), sleep('2026-08-01', 120)];
    expect(trailingSleepAverage(logs, TODAY)).toBe(480);
  });

  it('says nothing rather than zero with no entries', () => {
    expect(trailingSleepAverage([], TODAY)).toBeNull();
    expect(trailingSleepAverage([sleep('2026-09-20', 0)], TODAY)).toBeNull();
  });
});

describe('hours', () => {
  it('reads like a person wrote it', () => {
    expect(hours(480)).toBe('8h');
    expect(hours(440)).toBe('7h 20m');
    expect(hours(45)).toBe('45m');
    expect(hours(0)).toBe('0m');
    expect(hours(-20)).toBe('0m');
  });
});

describe('the sleep note', () => {
  it('picks the article by how the number sounds', () => {
    const note = (target: number) =>
      r({ sleepTargetMinutes: target }).components.find((c) => c.key === 'sleepTrend')!.note;
    expect(note(480)).toMatch(/against an 8h target/);
    expect(note(420)).toMatch(/against a 7h target/);
    expect(note(660)).toMatch(/against an 11h target/);
  });
});

describe('loadRatio', () => {
  const week = (weekStart: string, sets: number) => ({ weekStart, sets, workouts: 1 });

  it('projects a part-week to a full one before comparing', () => {
    const series = [week('2026-09-07', 70), week('2026-09-14', 70), week('2026-09-21', 20)];
    // Twenty sets over two days paces to seventy, which is exactly normal.
    expect(loadRatio(series, 2)).toBe(1);
  });

  it('reads a spike as a spike', () => {
    const series = [week('2026-09-07', 50), week('2026-09-14', 50), week('2026-09-21', 100)];
    expect(loadRatio(series, 7)).toBe(2);
  });

  it('does not call an untrained Monday detraining', () => {
    const series = [week('2026-09-07', 70), week('2026-09-14', 70), week('2026-09-21', 0)];
    expect(loadRatio(series, 1)).toBeNull();
    expect(loadRatio(series, 2)).toBeNull();
    // By midweek with nothing logged, it is a light week and says so.
    expect(loadRatio(series, 4)).toBe(0);
  });

  it('says nothing without a prior week to compare against', () => {
    expect(loadRatio([week('2026-09-21', 40)], 7)).toBeNull();
    expect(loadRatio([week('2026-09-14', 0), week('2026-09-21', 40)], 7)).toBeNull();
    expect(loadRatio([], 7)).toBeNull();
  });
});

describe('the caveat', () => {
  it('says what it cannot see, and that it is not medical', () => {
    expect(READINESS_CAVEAT).toMatch(/HRV/);
    expect(READINESS_CAVEAT).toMatch(/never as medical advice/i);
  });
});

describe('the measured signals', () => {
  it('outweighs the inferred components when a wearable is there', () => {
    const inferred = r();
    const collapsed = r({ hrvZ: -2.5, rhrZ: 2.2 });
    // Everything else identical; the body's own report moves the number hard.
    expect(collapsed.score).toBeLessThan(inferred.score - 15);
  });

  it('knows which direction is good for each', () => {
    // HRV up and resting heart rate down are both the good direction.
    expect(r({ hrvZ: 1.5 }).score).toBeGreaterThanOrEqual(r({ hrvZ: -1.5 }).score);
    expect(r({ rhrZ: -1.5 }).score).toBeGreaterThanOrEqual(r({ rhrZ: 1.5 }).score);
  });

  it('does not keep rewarding an unusually good morning', () => {
    // A great HRV is a fine morning, not a licence to double the session.
    expect(r({ hrvZ: 4 }).score).toBe(r({ hrvZ: 8 }).score);
  });

  it('leaves them out entirely when there is no wearable', () => {
    expect(r().components.map((c) => c.key)).not.toContain('hrv');
    expect(r({ hrvZ: null, rhrZ: null }).components.map((c) => c.key)).not.toContain('rhr');
  });

  it('ignores a value that is not a number rather than scoring it', () => {
    expect(r({ hrvZ: Number.NaN }).components.map((c) => c.key)).not.toContain('hrv');
  });

  it('still renormalises to one with the extra components in', () => {
    const total = r({ hrvZ: -1, rhrZ: 1 }).components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it('says what the signal did rather than restating the z', () => {
    const note = r({ hrvZ: -2.4 }).components.find((c) => c.key === 'hrv')!.note;
    expect(note).toMatch(/well below your own normal/i);
    expect(note).not.toMatch(/-?2\.4/);
  });
});
