import { readLoad, weekStartOf, weeklyVolumeSeries } from '../domain/volumeTrend';
import { groupHits, searchEntries, type SearchEntry } from '../domain/search';
import { rankBreakdown } from '../domain/rank';
import { beatTarget } from '../domain/records';
import { muscleShares, topMuscles } from '../domain/volume';
import type { SetEntry, Workout } from '../domain/types';

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: Math.random().toString(36).slice(2),
  weightKg: 100,
  reps: 5,
  rpe: null,
  completed: true,
  ...over,
});

const workout = (date: string, sets: SetEntry[], exerciseId = 'bench'): Workout =>
  ({
    id: `w_${date}_${exerciseId}`,
    name: 'Session',
    date,
    completedAt: `${date}T18:00:00.000Z`,
    status: 'completed',
    exercises: [
      {
        id: `we_${date}_${exerciseId}`,
        exerciseId,
        name: 'Bench',
        primaryMuscle: 'chest',
        restSeconds: 120,
        sets,
      },
    ],
  }) as unknown as Workout;

describe('weekStartOf', () => {
  it('anchors every day of a week to the same Monday', () => {
    // 2026-09-14 is a Monday.
    const days = ['2026-09-14', '2026-09-16', '2026-09-20'];
    expect(days.map(weekStartOf)).toEqual(['2026-09-14', '2026-09-14', '2026-09-14']);
  });

  it('puts Sunday with the week that preceded it, not the one that follows', () => {
    expect(weekStartOf('2026-09-13')).toBe('2026-09-07');
  });
});

describe('weeklyVolumeSeries', () => {
  it('fills weeks with no training rather than skipping them', () => {
    const series = weeklyVolumeSeries([workout('2026-09-15', [set(), set()])], '2026-09-17', 3);
    expect(series).toHaveLength(3);
    expect(series.map((w) => w.sets)).toEqual([0, 0, 2]);
    expect(series[2].weekStart).toBe('2026-09-14');
  });

  it('ignores warm-ups and unfinished sets', () => {
    const series = weeklyVolumeSeries(
      [workout('2026-09-15', [set(), set({ kind: 'warmup' }), set({ completed: false })])],
      '2026-09-17',
      1,
    );
    expect(series[0].sets).toBe(1);
  });
});

describe('readLoad', () => {
  const week = (weekStart: string, sets: number, workouts = 3) => ({ weekStart, sets, workouts });

  it('reports idle when nothing has been trained recently', () => {
    const r = readLoad([week('a', 0, 0), week('b', 0, 0), week('c', 0, 0), week('d', 0, 0)]);
    expect(r.verdict).toBe('idle');
  });

  it('calls for a deload after four straight non-decreasing weeks', () => {
    const r = readLoad([
      week('a', 10),
      week('b', 12),
      week('c', 14),
      week('d', 16),
      week('e', 18),
      week('f', 20),
    ]);
    expect(r.verdict).toBe('deload_due');
    expect(r.buildingWeeks).toBeGreaterThanOrEqual(4);
  });

  it('does not let a half-finished current week count towards the build streak', () => {
    // Five building weeks, then a current week with almost nothing in it yet.
    // The current week drags changePct to -88%, which would read as backing off
    // if the streak were measured through it.
    const r = readLoad([week('a', 8), week('b', 10), week('c', 12), week('d', 14), week('e', 16), week('f', 2)]);
    expect(r.verdict).toBe('deload_due');
    expect(r.buildingWeeks).toBe(4);
  });

  it('flags a steep single-week jump', () => {
    const r = readLoad([week('a', 5), week('b', 4), week('c', 10), week('d', 16)]);
    expect(r.verdict).toBe('ramping_fast');
    expect(r.changePct).toBe(60);
  });

  it('treats a small change as holding steady', () => {
    const r = readLoad([week('a', 20), week('b', 20), week('c', 21)]);
    expect(r.verdict).toBe('holding');
  });

  it('reports a genuine drop as backing off', () => {
    const r = readLoad([week('a', 20), week('b', 20), week('c', 10)]);
    expect(r.verdict).toBe('backing_off');
    expect(r.changePct).toBe(-50);
  });
});

describe('searchEntries', () => {
  const entries: SearchEntry[] = [
    { id: '1', kind: 'exercise', title: 'Barbell Bench Press', subtitle: 'Chest', href: '/e/1' },
    { id: '2', kind: 'exercise', title: 'Incline Dumbbell Press', subtitle: 'Chest', keywords: ['db'], href: '/e/2' },
    { id: '3', kind: 'exercise', title: 'Leg Press', subtitle: 'Quads', href: '/e/3' },
    { id: '4', kind: 'food', title: 'Chicken Breast', subtitle: 'Protein', href: '/f/4' },
    { id: '5', kind: 'screen', title: 'Settings', href: '/settings' },
  ];

  it('ranks a title prefix above a mid-word match', () => {
    const hits = searchEntries('leg', entries);
    expect(hits[0].id).toBe('3');
  });

  it('requires every token to match something', () => {
    expect(searchEntries('incline db', entries).map((h) => h.id)).toEqual(['2']);
    expect(searchEntries('incline squat', entries)).toEqual([]);
  });

  it('matches subtitles, so a muscle name finds its exercises', () => {
    const ids = searchEntries('chest', entries).map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['1', '2']));
    expect(ids).not.toContain('3');
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchEntries('   ', entries)).toEqual([]);
  });

  it('groups hits by kind while keeping rank order', () => {
    const groups = groupHits(searchEntries('press', entries));
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('exercise');
    expect(groups[0].hits.length).toBe(3);
  });
});

describe('rankBreakdown', () => {
  it('parts sum to the same total the score uses', () => {
    const inputs = {
      completedWorkouts: 20,
      longestDailyStreak: 9,
      bestBig3E1RMKg: 300,
      bodyweightKg: 80,
      bestDisciplineScore: 72,
    };
    const parts = rankBreakdown(inputs);
    const sum = parts.reduce((a, p) => a + p.value, 0);
    expect(sum).toBe(160 + 72 + Math.round((300 / 80 / 4) * 300) + 72);
    expect(parts.every((p) => p.value <= p.max)).toBe(true);
    expect(parts.every((p) => p.hint.length > 0)).toBe(true);
  });

  it('does not divide by zero when bodyweight is unknown', () => {
    const parts = rankBreakdown({
      completedWorkouts: 0,
      longestDailyStreak: 0,
      bestBig3E1RMKg: 0,
      bodyweightKg: null,
      bestDisciplineScore: 0,
    });
    expect(parts.every((p) => Number.isFinite(p.value))).toBe(true);
  });
});

describe('beatTarget', () => {
  it('asks for one more rep at the last top set', () => {
    const t = beatTarget(
      [
        workout('2026-09-10', [set({ weightKg: 90, reps: 5 })]),
        workout('2026-09-15', [set({ weightKg: 100, reps: 6 })]),
      ],
      'bench',
    );
    expect(t).toEqual({ weightKg: 100, reps: 6, targetReps: 7, date: '2026-09-15' });
  });

  it('picks the top set by estimated max, not by the heaviest bar', () => {
    // 100x2 estimates lower than 90x8, so the 90 is the set worth beating.
    const t = beatTarget([workout('2026-09-15', [set({ weightKg: 90, reps: 8 }), set({ weightKg: 100, reps: 2 })])], 'bench');
    expect(t?.weightKg).toBe(90);
    expect(t?.targetReps).toBe(9);
  });

  it('ignores warm-ups', () => {
    const t = beatTarget([workout('2026-09-15', [set({ weightKg: 140, reps: 12, kind: 'warmup' }), set({ weightKg: 60, reps: 5 })])], 'bench');
    expect(t?.weightKg).toBe(60);
  });

  it('returns null for a lift that has never been logged', () => {
    expect(beatTarget([workout('2026-09-15', [set()])], 'squat')).toBeNull();
  });
});

describe('muscle shares', () => {
  it('orders muscles by set count and drops empty ones', () => {
    expect(topMuscles({ chest: 4, back: 9, biceps: 0 })).toEqual([
      { muscle: 'back', sets: 9 },
      { muscle: 'chest', sets: 4 },
    ]);
  });

  it('shares add up to one', () => {
    const shares = muscleShares({ chest: 6, triceps: 3, shoulders: 1 });
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5);
    expect(shares[0].muscle).toBe('chest');
  });

  it('returns nothing rather than dividing by zero', () => {
    expect(muscleShares({})).toEqual([]);
  });
});
