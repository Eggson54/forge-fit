import { rarityOf } from '../domain/gyms';
import type { AchievementInputs } from '../domain/achievements';
import { useGamificationStore } from './useGamificationStore';
import { useGymStore } from './useGymStore';
import { useLogStore } from './useLogStore';
import { useWorkoutStore } from './useWorkoutStore';

/**
 * Every number the achievement catalog measures, read from the stores.
 *
 * This used to be assembled by hand at each call site, and the two copies had
 * already drifted: finishing a workout passed `progressPhotos: 0`, so the photo
 * badge could not unlock down that path. One reader means one answer.
 */
export function currentAchievementInputs(): AchievementInputs {
  const workouts = useWorkoutStore.getState();
  const gamification = useGamificationStore.getState();
  const gyms = useGymStore.getState();

  const claims = gyms.claims;
  const byId = gyms.gymsById();
  const kinds = new Set<string>();
  let rare = 0;
  for (const c of claims) {
    const gym = byId[c.gymId];
    if (!gym) continue;
    kinds.add(gym.kind);
    const rarity = rarityOf(gym);
    if (rarity === 'rare' || rarity === 'legendary') rare += 1;
  }

  return {
    workoutsCompleted: workouts.completedWorkouts().length,
    currentDailyStreak: gamification.streaks.daily,
    proteinStreak: gamification.streaks.protein,
    hydrationStreak: gamification.streaks.hydration,
    prsSet: Object.keys(workouts.prs).length,
    progressPhotos: useLogStore.getState().photos.length,
    bestDisciplineScore: gamification.bestDisciplineScore,
    gymsClaimed: claims.length,
    gymKindsClaimed: kinds.size,
    rareGymsClaimed: rare,
  };
}
