import { computeRank, RANK_TIERS } from '../domain/rank';
import { weeklySetsPerMuscle, volumeStatus } from '../domain/volume';
import type { Workout } from '../domain/types';

describe('forge rank', () => {
  it('a brand-new user is Ember with a low score', () => {
    const r = computeRank({ completedWorkouts: 0, longestDailyStreak: 0, bestBig3E1RMKg: 0, bodyweightKg: 80, bestDisciplineScore: 0 });
    expect(r.tier.key).toBe('ember');
    expect(r.score).toBe(0);
    expect(r.progressToNext).toBeGreaterThanOrEqual(0);
  });

  it('a consistent strong user climbs tiers', () => {
    const r = computeRank({ completedWorkouts: 60, longestDailyStreak: 30, bestBig3E1RMKg: 320, bodyweightKg: 80, bestDisciplineScore: 95 });
    // 400 consistency + 200 streak + 300 strength(ratio 4) + 95 => ~995 => Apex
    expect(r.score).toBeGreaterThanOrEqual(875);
    expect(r.tier.key).toBe('apex');
    expect(r.nextTier).toBeNull();
    expect(r.progressToNext).toBe(1);
  });

  it('tiers are ordered by ascending threshold', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i].min).toBeGreaterThan(RANK_TIERS[i - 1].min);
    }
  });

  it('progress-to-next is between 0 and 1 mid-tier', () => {
    const r = computeRank({ completedWorkouts: 25, longestDailyStreak: 5, bestBig3E1RMKg: 160, bodyweightKg: 80, bestDisciplineScore: 60 });
    expect(r.progressToNext).toBeGreaterThan(0);
    expect(r.progressToNext).toBeLessThanOrEqual(1);
    expect(r.nextTier).not.toBeNull();
  });
});

describe('weekly muscle volume', () => {
  const w = (sets: number): Workout => ({
    id: 'w', name: 'Push', status: 'completed', date: '2026-01-01', startedAt: null, completedAt: null,
    durationSeconds: null, focus: ['chest'],
    exercises: [{
      id: 'we', exerciseId: 'barbell_bench_press', name: 'Bench', primaryMuscle: 'chest', restSeconds: 120,
      sets: Array.from({ length: sets }, (_, i) => ({ id: 's' + i, weightKg: 100, reps: 8, rpe: null, completed: true })),
    }],
  });

  it('counts primary working sets and half-credits secondary', () => {
    const vol = weeklySetsPerMuscle([w(4)]);
    expect(vol.chest).toBe(4);
    // bench secondary = triceps, shoulders -> 2 each
    expect(vol.triceps).toBe(2);
    expect(vol.shoulders).toBe(2);
  });

  it('classifies volume against landmarks', () => {
    expect(volumeStatus('chest', 0)).toBe('none');
    expect(volumeStatus('chest', 4)).toBe('low');
    expect(volumeStatus('chest', 15)).toBe('optimal');
    expect(volumeStatus('chest', 30)).toBe('high');
  });
});
