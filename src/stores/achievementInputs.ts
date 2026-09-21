import { rarityOf } from '../domain/gyms';
import { totalCardio } from '../domain/cardio';
import { bestE1RMForExercise } from '../domain/strength';
import { STRENGTH_LEVELS, defaultColumn, summariseStandards } from '../domain/standards';
import { useProfileStore } from './useProfileStore';
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
  const logs = useLogStore.getState();
  const profile = useProfileStore.getState().profile;

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

  const cardio = totalCardio(logs.cardio);
  const cardioKinds = new Set(logs.cardio.map((c) => c.type)).size;

  // "Intermediate or better" on a lift, against whichever reference column the
  // profile implies. The standards screen lets the athlete switch columns for
  // themselves; a badge cannot be re-earned by flipping a toggle, so this one
  // reads the profile and stays put.
  const completed = workouts.completedWorkouts();
  const standards = summariseStandards(
    (id) => bestE1RMForExercise(completed, id),
    profile.weightKg ?? null,
    defaultColumn(profile.sex),
  );
  const intermediate = STRENGTH_LEVELS.indexOf('intermediate');
  const liftsAtIntermediate = standards.results.filter(
    (r) => STRENGTH_LEVELS.indexOf(r.level) >= intermediate,
  ).length;

  return {
    workoutsCompleted: completed.length,
    currentDailyStreak: gamification.streaks.daily,
    proteinStreak: gamification.streaks.protein,
    hydrationStreak: gamification.streaks.hydration,
    prsSet: Object.keys(workouts.prs).length,
    progressPhotos: logs.photos.length,
    bestDisciplineScore: gamification.bestDisciplineScore,
    gymsClaimed: claims.length,
    gymKindsClaimed: kinds.size,
    rareGymsClaimed: rare,
    cardioSessions: cardio.sessions,
    cardioMinutes: Math.round(cardio.minutes),
    cardioKinds,
    liftsAtIntermediate,
  };
}
