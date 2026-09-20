import { RANK_MAX, RANK_TIERS, computeRank, pointsToNext, tierLadder } from '../domain/rank';

describe('tierLadder', () => {
  it('spans the whole scale, so band widths can be used as bar widths', () => {
    const total = tierLadder(0).reduce((a, b) => a + b.span, 0);
    expect(total).toBe(RANK_MAX);
  });

  it('fills every cleared band and none of the ones ahead', () => {
    const bands = tierLadder(556);
    const byKey = Object.fromEntries(bands.map((b) => [b.tier.key, b]));
    expect(byKey.iron!.fill).toBe(1);
    expect(byKey.steel!.fill).toBe(1);
    expect(byKey.titanium!.fill).toBeCloseTo((556 - 500) / 200, 5);
    expect(byKey.obsidian!.fill).toBe(0);
    expect(byKey.apex!.fill).toBe(0);
  });

  it('marks exactly one band as current', () => {
    for (const score of [0, 149, 150, 499, 556, 700, 874, 875, 1000]) {
      expect(tierLadder(score).filter((b) => b.current)).toHaveLength(1);
    }
  });

  it('gives the top band to a perfect score', () => {
    expect(tierLadder(1000).find((b) => b.current)!.tier.key).toBe('apex');
  });

  it('clamps a score outside the scale rather than overflowing the bar', () => {
    expect(tierLadder(-50).every((b) => b.fill === 0 || b.tier.min === 0)).toBe(true);
    expect(tierLadder(5000).every((b) => b.fill === 1)).toBe(true);
  });

  it('agrees with the tier computeRank picks', () => {
    const rank = computeRank({
      completedWorkouts: 30,
      longestDailyStreak: 10,
      bestBig3E1RMKg: 300,
      bodyweightKg: 80,
      bestDisciplineScore: 70,
    });
    expect(tierLadder(rank.score).find((b) => b.current)!.tier.key).toBe(rank.tier.key);
  });
});

describe('pointsToNext', () => {
  it('counts the points owed, not a percentage', () => {
    const rank = { score: 556, tier: RANK_TIERS[3]!, tierIndex: 3, nextTier: RANK_TIERS[4]!, progressToNext: 0.28, parts: { consistency: 0, streak: 0, strength: 0, discipline: 0 } };
    expect(pointsToNext(rank)).toBe(144);
  });

  it('is null at the top, where there is nothing to owe', () => {
    const rank = { score: 900, tier: RANK_TIERS[5]!, tierIndex: 5, nextTier: null, progressToNext: 1, parts: { consistency: 0, streak: 0, strength: 0, discipline: 0 } };
    expect(pointsToNext(rank)).toBeNull();
  });
});
