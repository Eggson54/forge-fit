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

export interface RankPart {
  key: keyof RankResult['parts'];
  label: string;
  value: number;
  max: number;
  /** What would move this number, in plain terms. */
  hint: string;
}

/**
 * The same four numbers `forgeScore` adds up, laid out so the leaderboard can
 * show *why* a score is what it is. A ranked score nobody can explain is just a
 * number that makes people feel bad, so every part states what raises it.
 */
export function rankBreakdown(i: RankInputs): RankPart[] {
  const parts = forgeScore(i);
  const bw = num(i.bodyweightKg) > 0 ? num(i.bodyweightKg) : 75;
  const ratio = num(i.bestBig3E1RMKg) / bw;
  return [
    {
      key: 'consistency',
      label: 'Consistency',
      value: parts.consistency,
      max: 400,
      hint: `${num(i.completedWorkouts)} sessions logged · 8 points each, capped at 400.`,
    },
    {
      key: 'streak',
      label: 'Streak',
      value: parts.streak,
      max: 200,
      hint: `Best run of ${num(i.longestDailyStreak)} days · 8 points a day, capped at 200.`,
    },
    {
      key: 'strength',
      label: 'Relative strength',
      value: parts.strength,
      max: 300,
      hint: `Estimated big-three total is ${ratio.toFixed(1)}× your bodyweight · 4× earns the full 300.`,
    },
    {
      key: 'discipline',
      label: 'Discipline',
      value: parts.discipline,
      max: 100,
      hint: `Best daily discipline score of ${Math.round(num(i.bestDisciplineScore))} out of 100.`,
    },
  ];
}

export interface LadderBand {
  tier: RankTier;
  /** Points the band spans; the bar gives it width in proportion. */
  span: number;
  /** 0–1 of this band that the score has covered. */
  fill: number;
  reached: boolean;
  current: boolean;
}

/** The top of the ladder. Apex has no successor, so its band ends here. */
export const RANK_MAX = 1000;

/**
 * The score laid out across every tier band.
 *
 * The card used to show "556 / 1000" above a bar filled to 28%, because the
 * number was measured against the whole scale and the bar against the current
 * tier. One of them had to go; a ladder keeps both readings true, since the
 * filled length really is the score out of 1000 and the band boundaries say
 * what it buys.
 */
export function tierLadder(score: number, tiers: RankTier[] = RANK_TIERS): LadderBand[] {
  const s = clamp(num(score), 0, RANK_MAX);
  return tiers.map((tier, i) => {
    const top = tiers[i + 1]?.min ?? RANK_MAX;
    const span = Math.max(1, top - tier.min);
    const fill = clamp((s - tier.min) / span, 0, 1);
    // The top band owns a perfect score: `< top` would leave 1000 belonging to
    // no tier at all.
    const last = i === tiers.length - 1;
    return { tier, span, fill, reached: s >= tier.min, current: s >= tier.min && (s < top || last) };
  });
}

/** Points still owed to the next tier, or null at the top. */
export function pointsToNext(rank: RankResult): number | null {
  return rank.nextTier ? Math.max(0, rank.nextTier.min - rank.score) : null;
}
