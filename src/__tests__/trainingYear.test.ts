import {
  lifetimeStats,
  longestRunOfDates,
  monthlyTotals,
  trainingGrid,
} from '../domain/trainingYear';
import type { SetEntry, Workout } from '../domain/types';

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg: 100,
  reps: 5,
  rpe: null,
  completed: true,
  ...over,
});

const session = (date: string, sets: SetEntry[] = [set(), set()], durationSeconds = 3600): Workout =>
  ({
    id: `w_${date}_${Math.random()}`,
    name: 'Session',
    date,
    completedAt: `${date}T18:00:00.000Z`,
    durationSeconds,
    status: 'completed',
    exercises: [
      { id: 'we', exerciseId: 'bench', name: 'Bench', primaryMuscle: 'chest', restSeconds: 120, sets },
    ],
  }) as unknown as Workout;

describe('trainingGrid', () => {
  // 2026-09-19 is a Saturday; its Monday is 2026-09-14.
  const today = '2026-09-19';

  it('is a rectangle of whole weeks starting on Mondays', () => {
    const grid = trainingGrid([], today, 5);
    expect(grid.weeks).toHaveLength(5);
    for (const column of grid.weeks) {
      expect(column).toHaveLength(7);
      expect(new Date(`${column[0]!.date}T00:00:00`).getDay()).toBe(1);
    }
    expect(grid.weeks[4]![0]!.date).toBe('2026-09-14');
  });

  it('emits the rest of the current week rather than a ragged edge', () => {
    // A half-drawn final column reads as a rendering bug, not as "not over yet".
    const grid = trainingGrid([], today, 2);
    expect(grid.to).toBe('2026-09-20');
    expect(grid.weeks[1]!.every((d) => d.sessions === 0)).toBe(true);
  });

  it('counts sessions and working sets onto the right day', () => {
    const grid = trainingGrid(
      [session('2026-09-15'), session('2026-09-15'), session('2026-09-16', [set(), set(), set()])],
      today,
      2,
    );
    const week = grid.weeks[1]!;
    expect(week[1]!.date).toBe('2026-09-15');
    expect(week[1]!.sessions).toBe(2);
    expect(week[1]!.sets).toBe(4);
    expect(week[2]!.sets).toBe(3);
  });

  it('ignores warm-ups and unfinished sets', () => {
    const grid = trainingGrid(
      [session('2026-09-15', [set(), set({ kind: 'warmup' }), set({ completed: false })])],
      today,
      2,
    );
    expect(grid.weeks[1]![1]!.sets).toBe(1);
  });

  it('scales levels to this athlete rather than to fixed thresholds', () => {
    // A beginner's biggest day should still light up fully; otherwise the grid
    // is permanently pale for everyone who is not a high-volume lifter.
    const light = trainingGrid(
      ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((d, i) =>
        session(d, Array.from({ length: i + 1 }, () => set())),
      ),
      today,
      2,
    );
    const levels = light.weeks[1]!.slice(0, 4).map((d) => d.level);
    expect(Math.max(...levels)).toBe(4);
    expect(Math.min(...levels)).toBeGreaterThan(0);
  });

  it('gives rest days level zero, always', () => {
    const grid = trainingGrid([session('2026-09-15')], today, 2);
    expect(grid.weeks[1]![0]!.level).toBe(0);
    expect(grid.weeks[1]![1]!.level).toBeGreaterThan(0);
  });

  it('labels a month once, on the column where it starts', () => {
    const grid = trainingGrid([], today, 10);
    const labelled = grid.monthLabels.filter(Boolean);
    expect(labelled.length).toBeGreaterThan(0);
    // No month label ever repeats on consecutive columns.
    for (let i = 1; i < grid.monthLabels.length; i += 1) {
      if (grid.monthLabels[i] && grid.monthLabels[i - 1]) {
        expect(grid.monthLabels[i]).not.toBe(grid.monthLabels[i - 1]);
      }
    }
  });

  it('survives an empty history without NaN levels', () => {
    const grid = trainingGrid([], today, 3);
    expect(grid.weeks.flat().every((d) => d.level === 0)).toBe(true);
  });

  it('ignores sessions that were never completed', () => {
    const inProgress = { ...session('2026-09-15'), status: 'in_progress' } as unknown as Workout;
    expect(trainingGrid([inProgress], today, 2).weeks[1]![1]!.sessions).toBe(0);
  });
});

describe('lifetimeStats', () => {
  it('totals the whole history', () => {
    const s = lifetimeStats([
      session('2026-01-05', [set({ weightKg: 100, reps: 5 }), set({ weightKg: 100, reps: 5 })], 3600),
      session('2026-01-06', [set({ weightKg: 60, reps: 10 })], 1800),
    ]);
    expect(s.sessions).toBe(2);
    expect(s.sets).toBe(3);
    expect(s.reps).toBe(20);
    expect(s.volumeKg).toBe(100 * 5 * 2 + 60 * 10);
    expect(s.hours).toBe(1.5);
    expect(s.days).toBe(2);
    expect(s.firstSession).toBe('2026-01-05');
    expect(s.exercises).toBe(1);
  });

  it('counts warm-ups in lifetime volume, unlike the weekly load reading', () => {
    // Two different questions: what counts towards adaptation, and how much
    // have I moved in my life.
    const s = lifetimeStats([session('2026-01-05', [set({ weightKg: 40, reps: 10, kind: 'warmup' })])]);
    expect(s.volumeKg).toBe(400);
  });

  it('counts days trained, not sessions, for the day total', () => {
    const s = lifetimeStats([session('2026-01-05'), session('2026-01-05')]);
    expect(s.sessions).toBe(2);
    expect(s.days).toBe(1);
  });

  it('is all zeroes for an empty history rather than NaN', () => {
    const s = lifetimeStats([]);
    expect(s).toMatchObject({ sessions: 0, sets: 0, reps: 0, volumeKg: 0, hours: 0, days: 0, longestRun: 0 });
    expect(s.firstSession).toBeNull();
  });
});

describe('longestRunOfDates', () => {
  it('finds the longest consecutive run', () => {
    expect(longestRunOfDates(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'])).toBe(3);
  });

  it('does not care what order it is given them in', () => {
    expect(longestRunOfDates(['2026-01-05', '2026-01-02', '2026-01-01', '2026-01-03'])).toBe(3);
  });

  it('counts a duplicate day once', () => {
    expect(longestRunOfDates(['2026-01-01', '2026-01-01', '2026-01-02'])).toBe(2);
  });

  it('crosses a month boundary', () => {
    expect(longestRunOfDates(['2026-01-30', '2026-01-31', '2026-02-01'])).toBe(3);
  });

  it('is zero for nothing and one for a single day', () => {
    expect(longestRunOfDates([])).toBe(0);
    expect(longestRunOfDates(['2026-01-01'])).toBe(1);
  });
});

describe('monthlyTotals', () => {
  it('buckets the grid into calendar months, oldest first', () => {
    const grid = trainingGrid([session('2026-09-15'), session('2026-08-20')], '2026-09-19', 10);
    const months = monthlyTotals(grid);
    expect(months.length).toBeGreaterThanOrEqual(2);
    expect(months.map((m) => m.month)).toEqual([...months.map((m) => m.month)].sort());
    const sept = months.find((m) => m.month === '2026-09-01')!;
    expect(sept.sessions).toBe(1);
  });
});

describe('grid levels', () => {
  const today = '2026-09-19';
  const withSets = (date: string, n: number) => session(date, Array.from({ length: n }, () => set()));

  it('always lights the busiest day fully', () => {
    const grid = trainingGrid(
      ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map((d, i) => withSets(d, i + 1)),
      today,
      2,
    );
    const trained = grid.weeks[1]!.filter((d) => d.sets > 0);
    expect(Math.max(...trained.map((d) => d.level))).toBe(4);
  });

  it('gives identical days identical levels', () => {
    const grid = trainingGrid(
      ['2026-09-14', '2026-09-15', '2026-09-16'].map((d) => withSets(d, 5)),
      today,
      2,
    );
    const levels = grid.weeks[1]!.filter((d) => d.sets > 0).map((d) => d.level);
    expect(new Set(levels).size).toBe(1);
    // No spread to grade, so a trained day is shown at full rather than faint.
    expect(levels[0]).toBe(4);
  });

  it('never returns a level outside 0–4', () => {
    const grid = trainingGrid(
      Array.from({ length: 30 }, (_, i) => withSets(`2026-09-${String((i % 28) + 1).padStart(2, '0')}`, i + 1)),
      today,
      8,
    );
    for (const day of grid.weeks.flat()) {
      expect(day.level).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeLessThanOrEqual(4);
    }
  });
});
