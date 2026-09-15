import type { Achievement } from './types';

/** Achievement catalog. `unlockedAt` is filled per-user at runtime. */
export const ACHIEVEMENT_CATALOG: Omit<Achievement, 'unlockedAt'>[] = [
  { id: 'first_workout', title: 'First Rep', description: 'Complete your first workout', icon: 'dumbbell', tint: '#F2530F' },
  { id: 'streak_7', title: '7-Day Streak', description: '7 days of completed goals in a row', icon: 'flame', tint: '#FFB020' },
  { id: 'streak_30', title: '30-Day Machine', description: '30-day discipline streak', icon: 'trophy', tint: '#FFD062' },
  { id: 'workouts_10', title: 'Consistent', description: 'Log 10 workouts', icon: 'repeat', tint: '#12A181' },
  { id: 'workouts_100', title: 'Centurion', description: 'Log 100 workouts', icon: 'shield', tint: '#C084FC' },
  { id: 'first_pr', title: 'New PR', description: 'Set your first personal record', icon: 'chart', tint: '#2E9BE0' },
  { id: 'protein_week', title: 'Protein Locked In', description: 'Hit protein 7 days straight', icon: 'bolt', tint: '#12A181' },
  { id: 'hydrated_week', title: 'Hydrated', description: 'Hit water goal 7 days straight', icon: 'water', tint: '#2E9BE0' },
  { id: 'first_photo', title: 'Documented', description: 'Add your first progress photo', icon: 'camera', tint: '#D2529E' },
  { id: 'perfect_day', title: 'Perfect Day', description: 'Reach 100% discipline in a day', icon: 'target', tint: '#C6F135' },
];

export interface AchievementInputs {
  workoutsCompleted: number;
  currentDailyStreak: number;
  proteinStreak: number;
  hydrationStreak: number;
  prsSet: number;
  progressPhotos: number;
  bestDisciplineScore: number;
}

/** Return achievement ids that should be unlocked given current stats. */
export function evaluateAchievements(i: AchievementInputs): string[] {
  const unlocked: string[] = [];
  if (i.workoutsCompleted >= 1) unlocked.push('first_workout');
  if (i.workoutsCompleted >= 10) unlocked.push('workouts_10');
  if (i.workoutsCompleted >= 100) unlocked.push('workouts_100');
  if (i.currentDailyStreak >= 7) unlocked.push('streak_7');
  if (i.currentDailyStreak >= 30) unlocked.push('streak_30');
  if (i.prsSet >= 1) unlocked.push('first_pr');
  if (i.proteinStreak >= 7) unlocked.push('protein_week');
  if (i.hydrationStreak >= 7) unlocked.push('hydrated_week');
  if (i.progressPhotos >= 1) unlocked.push('first_photo');
  if (i.bestDisciplineScore >= 100) unlocked.push('perfect_day');
  return unlocked;
}
