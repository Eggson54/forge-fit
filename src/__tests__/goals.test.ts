import {
  formatGoalValue,
  periodRange,
  progressFor,
  suggestTarget,
  type Goal,
  type GoalContribution,
} from '../domain/goals';

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1', period: 'week', metric: 'distance', target: 50_000, types: [], enabled: true, ...over,
});

const day = (date: string, km: number, type = 'run'): GoalContribution => ({
  date, type, distanceM: km * 1000, minutes: km * 5, ascentM: km * 10,
});

describe('periodRange', () => {
  it('runs a week Monday to Sunday', () => {
    // 2026-09-23 is a Wednesday.
    const r = periodRange('week', '2026-09-23');
    expect(r.from).toBe('2026-09-21');
    expect(r.to).toBe('2026-09-27');
    expect(r.days).toBe(7);
    expect(r.elapsed).toBe(3);
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    const r = periodRange('week', '2026-09-27');
    expect(r.from).toBe('2026-09-21');
    expect(r.elapsed).toBe(7);
  });

  it('uses calendar months, with the right number of days', () => {
    expect(periodRange('month', '2026-02-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', days: 28, elapsed: 10 });
    expect(periodRange('month', '2024-02-10').days).toBe(29);
    expect(periodRange('month', '2026-01-31')).toMatchObject({ to: '2026-01-31', days: 31, elapsed: 31 });
  });

  it('uses the calendar year', () => {
    const r = periodRange('year', '2026-07-01');
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-12-31');
    expect(r.days).toBe(365);
    expect(r.elapsed).toBe(182);
  });
});

describe('progressFor', () => {
  it('counts only what falls inside the period', () => {
    const p = progressFor(goal(), [day('2026-09-20', 20), day('2026-09-22', 10)], '2026-09-23');
    expect(p.done).toBe(10_000);
  });

  it('filters by activity type when the goal names any', () => {
    const p = progressFor(
      goal({ types: ['run'] }),
      [day('2026-09-22', 10, 'run'), day('2026-09-22', 40, 'ride')],
      '2026-09-23',
    );
    expect(p.done).toBe(10_000);
  });

  it('counts every type when the goal names none', () => {
    const p = progressFor(goal(), [day('2026-09-22', 10, 'run'), day('2026-09-22', 40, 'ride')], '2026-09-23');
    expect(p.done).toBe(50_000);
  });

  it('compares against elapsed time, not just the target', () => {
    // 20 km by Wednesday against 50 for the week: 3/7 elapsed expects ~21.4.
    const p = progressFor(goal(), [day('2026-09-22', 20)], '2026-09-23');
    expect(p.expected).toBeCloseTo(50_000 * (3 / 7), 0);
    expect(p.aheadBy).toBeLessThan(0);
  });

  it('gives a day of grace rather than calling Tuesday a failure', () => {
    // Fractionally behind an even pace should still read as on track.
    const p = progressFor(goal(), [day('2026-09-22', 20)], '2026-09-23');
    expect(p.onTrack).toBe(true);
  });

  it('calls a real shortfall a shortfall', () => {
    const p = progressFor(goal(), [day('2026-09-22', 2)], '2026-09-25');
    expect(p.onTrack).toBe(false);
    expect(p.detail).toMatch(/behind an even pace/i);
  });

  it('works out what is needed per remaining day', () => {
    const p = progressFor(goal(), [day('2026-09-22', 20)], '2026-09-23');
    // 30 km left across Thursday to Sunday.
    expect(p.daysLeft).toBe(4);
    expect(p.perDayNeeded).toBeCloseTo(7500, 0);
  });

  it('declares it done, and says how early', () => {
    const p = progressFor(goal(), [day('2026-09-22', 60)], '2026-09-23');
    expect(p.perDayNeeded).toBeNull();
    expect(p.detail).toMatch(/done, with 4 days/i);
  });

  it('does not hector at the end of a missed period', () => {
    const p = progressFor(goal(), [day('2026-09-22', 10)], '2026-09-27');
    expect(p.daysLeft).toBe(0);
    expect(p.detail).toMatch(/whether the target was the right one/i);
    expect(p.detail).not.toMatch(/you must|go out|push/i);
  });

  it('shows overshoot rather than capping at 100%', () => {
    const p = progressFor(goal(), [day('2026-09-22', 75)], '2026-09-23');
    expect(p.fraction).toBeCloseTo(1.5, 3);
  });

  it('survives a target of zero without dividing by it', () => {
    const p = progressFor(goal({ target: 0 }), [day('2026-09-22', 10)], '2026-09-23');
    expect(Number.isFinite(p.fraction)).toBe(true);
  });

  it('counts activities, time and climbing as well as distance', () => {
    const contributions = [day('2026-09-22', 10), day('2026-09-23', 10)];
    expect(progressFor(goal({ metric: 'activities', target: 4 }), contributions, '2026-09-23').done).toBe(2);
    expect(progressFor(goal({ metric: 'time', target: 300 }), contributions, '2026-09-23').done).toBe(100);
    expect(progressFor(goal({ metric: 'elevation', target: 1000 }), contributions, '2026-09-23').done).toBe(200);
  });
});

describe('suggestTarget', () => {
  it('refuses on almost no history', () => {
    expect(suggestTarget('week', 'distance', [day('2026-09-22', 10)], '2026-09-23')).toBeNull();
  });

  it('suggests a little above what they have been doing', () => {
    // 10 km every other day for four weeks is ~35 km a week.
    const history = Array.from({ length: 14 }, (_, i) => day(`2026-09-${String(i * 2 + 1).padStart(2, '0')}`, 5));
    const target = suggestTarget('week', 'distance', history, '2026-09-28')!;
    expect(target).toBeGreaterThan(0);
    expect(target % 500).toBe(0);
  });

  it('rounds sensibly per metric', () => {
    const history = Array.from({ length: 10 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, 8));
    expect(suggestTarget('week', 'time', history, '2026-09-28')! % 5).toBe(0);
    expect(Number.isInteger(suggestTarget('week', 'activities', history, '2026-09-28')!)).toBe(true);
  });

  it('returns null when the history has no distance in it at all', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({ ...day(`2026-09-${String(i + 1).padStart(2, '0')}`, 0) }));
    expect(suggestTarget('week', 'distance', flat, '2026-09-28')).toBeNull();
  });
});

describe('formatGoalValue', () => {
  it('uses kilometres past a thousand metres', () => {
    expect(formatGoalValue(500, 'distance')).toBe('500 m');
    expect(formatGoalValue(12_400, 'distance')).toBe('12.4 km');
  });

  it('uses hours past an hour', () => {
    expect(formatGoalValue(45, 'time')).toBe('45m');
    expect(formatGoalValue(150, 'time')).toBe('2h 30m');
  });

  it('keeps activity counts as counts', () => {
    expect(formatGoalValue(3, 'activities')).toBe('3');
  });
});
