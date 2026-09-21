import type { Achievement, AchievementMetric } from './types';

/**
 * Achievement catalog. `unlockedAt` is filled per-user at runtime.
 *
 * Each badge names the metric it measures and the value that unlocks it, so
 * the unlock rule and the progress bar are the same fact. They used to be a
 * list of if-statements next to a list of descriptions, which is two places to
 * change a threshold and one of them silently lying.
 */
export const ACHIEVEMENT_CATALOG: Omit<Achievement, 'unlockedAt'>[] = [
  { id: 'first_workout', title: 'First Rep', description: 'Complete your first workout', icon: 'dumbbell', tint: '#F2530F', metric: 'workoutsCompleted', target: 1 },
  { id: 'workouts_10', title: 'Consistent', description: 'Log 10 workouts', icon: 'repeat', tint: '#12A181', metric: 'workoutsCompleted', target: 10 },
  { id: 'workouts_100', title: 'Centurion', description: 'Log 100 workouts', icon: 'shield', tint: '#C084FC', metric: 'workoutsCompleted', target: 100 },
  { id: 'streak_7', title: '7-Day Streak', description: '7 days of completed goals in a row', icon: 'flame', tint: '#FFB020', metric: 'currentDailyStreak', target: 7 },
  { id: 'streak_30', title: '30-Day Machine', description: '30-day discipline streak', icon: 'trophy', tint: '#FFD062', metric: 'currentDailyStreak', target: 30 },
  { id: 'first_pr', title: 'New PR', description: 'Set your first personal record', icon: 'chart', tint: '#2E9BE0', metric: 'prsSet', target: 1 },
  { id: 'protein_week', title: 'Protein Locked In', description: 'Hit protein 7 days straight', icon: 'bolt', tint: '#12A181', metric: 'proteinStreak', target: 7 },
  { id: 'hydrated_week', title: 'Hydrated', description: 'Hit water goal 7 days straight', icon: 'water', tint: '#2E9BE0', metric: 'hydrationStreak', target: 7 },
  { id: 'first_photo', title: 'Documented', description: 'Add your first progress photo', icon: 'camera', tint: '#D2529E', metric: 'progressPhotos', target: 1 },
  { id: 'perfect_day', title: 'Perfect Day', description: 'Reach 100% discipline in a day', icon: 'target', tint: '#C6F135', metric: 'bestDisciplineScore', target: 100 },

  // Iron Map. These count places visited, never distance covered — see the
  // note in domain/gyms.ts on why nothing here pays for mileage.
  { id: 'first_gym', title: 'Home Ground', description: 'Claim your first gym', icon: 'map', tint: '#39E6C3', metric: 'gymsClaimed', target: 1 },
  { id: 'gyms_5', title: 'Away Days', description: 'Claim 5 different gyms', icon: 'map', tint: '#7FB2FF', metric: 'gymsClaimed', target: 5 },
  { id: 'gyms_25', title: 'Iron Cartographer', description: 'Claim 25 different gyms', icon: 'map', tint: '#FFB020', metric: 'gymsClaimed', target: 25 },
  { id: 'gym_kinds_5', title: 'Not Fussy', description: 'Train in 5 different kinds of gym', icon: 'star', tint: '#C6F135', metric: 'gymKindsClaimed', target: 5 },
  { id: 'rare_gym', title: 'Off The Beaten Rack', description: 'Claim a rare or legendary gym', icon: 'trophy', tint: '#C084FC', metric: 'rareGymsClaimed', target: 1 },

  // Conditioning. Counted in sessions and minutes rather than distance, for
  // the same reason the gym badges count places and not mileage: a badge that
  // pays per mile is a badge that rewards going further than you meant to.
  { id: 'first_cardio', title: 'Off The Rack', description: 'Log your first conditioning session', icon: 'steps', tint: '#39E6C3', metric: 'cardioSessions', target: 1 },
  { id: 'cardio_25', title: 'Two Engines', description: 'Log 25 conditioning sessions', icon: 'steps', tint: '#7FB2FF', metric: 'cardioSessions', target: 25 },
  { id: 'cardio_600', title: 'Ten Hours', description: 'Log 600 minutes of conditioning', icon: 'timer', tint: '#C6F135', metric: 'cardioMinutes', target: 600 },
  { id: 'cardio_kinds_4', title: 'Cross Trained', description: 'Log 4 different kinds of conditioning', icon: 'repeat', tint: '#FFB020', metric: 'cardioKinds', target: 4 },

  // Strength standards. The threshold is "intermediate on three lifts", which
  // is a real milestone rather than a number that only counts sessions.
  { id: 'intermediate_3', title: 'No Longer New', description: 'Reach Intermediate on 3 main lifts', icon: 'levels', tint: '#39E6C3', metric: 'liftsAtIntermediate', target: 3 },
  { id: 'intermediate_all', title: 'Across The Board', description: 'Reach Intermediate on every main lift', icon: 'levels', tint: '#C6F135', metric: 'liftsAtIntermediate', target: 6 },
];

export type AchievementInputs = Record<AchievementMetric, number>;

export interface AchievementProgress {
  current: number;
  target: number;
  /** 0-1, clamped. */
  ratio: number;
  remaining: number;
}

/** How close the athlete is to a badge, in the badge's own units. */
export function achievementProgress(
  achievement: Pick<Achievement, 'metric' | 'target'>,
  inputs: AchievementInputs,
): AchievementProgress {
  const current = Math.max(0, inputs[achievement.metric] ?? 0);
  const target = Math.max(1, achievement.target);
  return {
    current: Math.min(current, target),
    target,
    ratio: Math.min(1, current / target),
    remaining: Math.max(0, target - current),
  };
}

/** Return achievement ids that should be unlocked given current stats. */
export function evaluateAchievements(inputs: AchievementInputs): string[] {
  return ACHIEVEMENT_CATALOG.filter((a) => (inputs[a.metric] ?? 0) >= a.target).map((a) => a.id);
}

/**
 * Locked badges ordered by how close they are, nearest first. Ties break on the
 * smaller target, so "one more workout" beats "one more of a bigger thing".
 */
export function nextAchievements(achievements: Achievement[], inputs: AchievementInputs, limit = 3): Achievement[] {
  return achievements
    .filter((a) => !a.unlockedAt)
    .map((a) => ({ a, p: achievementProgress(a, inputs) }))
    .sort((x, y) => y.p.ratio - x.p.ratio || x.p.target - y.p.target)
    .slice(0, limit)
    .map((x) => x.a);
}

/**
 * What the remaining count is counting.
 *
 * "12 to go" under a discipline badge read as twelve days; it is twelve
 * points. Every badge measures something different, so the noun has to come
 * from the metric rather than from the card it lands on.
 */
const METRIC_NOUN: Record<AchievementMetric, [one: string, many: string]> = {
  workoutsCompleted: ['workout', 'workouts'],
  currentDailyStreak: ['day', 'days'],
  proteinStreak: ['day', 'days'],
  hydrationStreak: ['day', 'days'],
  prsSet: ['PR', 'PRs'],
  progressPhotos: ['photo', 'photos'],
  bestDisciplineScore: ['point', 'points'],
  gymsClaimed: ['gym', 'gyms'],
  gymKindsClaimed: ['kind', 'kinds'],
  rareGymsClaimed: ['gym', 'gyms'],
  cardioSessions: ['session', 'sessions'],
  cardioMinutes: ['minute', 'minutes'],
  cardioKinds: ['kind', 'kinds'],
  liftsAtIntermediate: ['lift', 'lifts'],
};

export function remainingLabel(metric: AchievementMetric, remaining: number): string {
  const [one, many] = METRIC_NOUN[metric];
  return `${remaining} ${remaining === 1 ? one : many} to go`;
}
