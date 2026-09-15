import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACHIEVEMENT_CATALOG, evaluateAchievements, type AchievementInputs } from '../domain/achievements';
import { applyDailyOutcome, emptyStreaks, type DailyOutcome } from '../domain/streaks';
import type { Achievement, StreakState } from '../domain/types';
import { jsonStorage, STORE_KEYS } from './persist';

interface GamificationState {
  streaks: StreakState;
  achievements: Achievement[];
  bestDisciplineScore: number;

  recordDay: (outcome: DailyOutcome) => void;
  syncAchievements: (inputs: AchievementInputs) => Achievement[]; // returns newly unlocked
  noteDisciplineScore: (score: number) => void;
  reset: () => void;
}

function initialAchievements(): Achievement[] {
  return ACHIEVEMENT_CATALOG.map((a) => ({ ...a, unlockedAt: null }));
}

/**
 * Reconcile a persisted list against the current catalog: badges added in a
 * later release appear (locked) for existing users, badges that were removed
 * drop out, and copy changes take effect — while unlock dates are preserved.
 */
function mergeWithCatalog(saved: Achievement[] | undefined): Achievement[] {
  const unlockedAt = new Map((saved ?? []).map((a) => [a.id, a.unlockedAt] as const));
  return ACHIEVEMENT_CATALOG.map((a) => ({ ...a, unlockedAt: unlockedAt.get(a.id) ?? null }));
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      streaks: emptyStreaks(),
      achievements: initialAchievements(),
      bestDisciplineScore: 0,

      recordDay: (outcome) => set((s) => ({ streaks: applyDailyOutcome(s.streaks, outcome) })),

      noteDisciplineScore: (score) =>
        set((s) => ({ bestDisciplineScore: Math.max(s.bestDisciplineScore, score) })),

      syncAchievements: (inputs) => {
        const shouldUnlock = new Set(evaluateAchievements(inputs));
        const now = new Date().toISOString();
        const newly: Achievement[] = [];
        const achievements = get().achievements.map((a) => {
          if (shouldUnlock.has(a.id) && !a.unlockedAt) {
            const unlocked = { ...a, unlockedAt: now };
            newly.push(unlocked);
            return unlocked;
          }
          return a;
        });
        if (newly.length) set({ achievements });
        return newly;
      },

      reset: () => set({ streaks: emptyStreaks(), achievements: initialAchievements(), bestDisciplineScore: 0 }),
    }),
    {
      name: STORE_KEYS.gamification,
      storage: jsonStorage(),
      onRehydrateStorage: () => (state) => {
        if (state) state.achievements = mergeWithCatalog(state.achievements);
      },
    },
  ),
);
