import { clamp } from './units';

/**
 * "Forge Rank" — an original gamified tier system (inspired by the ranked-gym
 * category, not any specific app's tiers/art). A 0–1000 Forge Score is computed
 * from training consistency, streaks, relative strength and discipline, then
 * mapped to six ascending tiers.
 */
export interface RankTier {
  key: string;
  name: string;
  min: number;
  color: string;
}

export const RANK_TIERS: RankTier[] = [
  { key: 'ember', name: 'Ember', min: 0, color: '#FF7A3D' },
  { key: 'iron', name: 'Iron', min: 150, color: '#A9ADBF' },
  { key: 'steel', name: 'Steel', min: 300, color: '#7FB2FF' },
  { key: 'titanium', name: 'Titanium', min: 500, color: '#39E6C3' },
  { key: 'obsidian', name: 'Obsidian', min: 700, color: '#C084FC' },
  { key: 'apex', name: 'Apex', min: 875, color: '#C6F135' },
];

export interface RankInputs {
  completedWorkouts: number;
  longestDailyStreak: number;
  /** Best estimated 1RM (kg) summed across the main lifts the user has logged. */
  bestBig3E1RMKg: number;
  bodyweightKg: number | null;
  bestDisciplineScore: number;
}

export interface RankResult {
  score: number; // 0..1000
  tier: RankTier;
  tierIndex: number;
  nextTier: RankTier | null;
  progressToNext: number; // 0..1
  parts: { consistency: number; streak: number; strength: number; discipline: number };
}

/** Coerce a possibly missing/NaN persisted value to a usable number. */
const num = (v: number | null | undefined, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function forgeScore(i: RankInputs): RankResult['parts'] & { total: number } {
  const consistency = Math.min(400, num(i.completedWorkouts) * 8);
  const streak = Math.min(200, num(i.longestDailyStreak) * 8);
  // Relative strength: big-3 e1RM total vs bodyweight. ~4x bodyweight => full points.
  const bwRaw = num(i.bodyweightKg);
  const bw = bwRaw > 0 ? bwRaw : 75;
  const ratio = num(i.bestBig3E1RMKg) / bw; // e.g. 4.0 is strong for combined big lifts
  const strength = Math.min(300, Math.round((ratio / 4) * 300));
  const discipline = Math.min(100, Math.round(num(i.bestDisciplineScore)));
  const total = clamp(consistency + streak + strength + discipline, 0, 1000);
  return { consistency, streak, strength, discipline, total };
}

export function computeRank(i: RankInputs): RankResult {
  const parts = forgeScore(i);
  let tierIndex = 0;
  for (let t = 0; t < RANK_TIERS.length; t++) {
    if (parts.total >= RANK_TIERS[t]!.min) tierIndex = t;
  }
  const tier = RANK_TIERS[tierIndex]!;
  const nextTier = RANK_TIERS[tierIndex + 1] ?? null;
  const progressToNext = nextTier ? clamp((parts.total - tier.min) / (nextTier.min - tier.min), 0, 1) : 1;
  return {
    score: parts.total,
    tier,
    tierIndex,
    nextTier,
    progressToNext,
    parts: { consistency: parts.consistency, streak: parts.streak, strength: parts.strength, discipline: parts.discipline },
  };
}
