import { useAuthStore } from './useAuthStore';
import { useGamificationStore } from './useGamificationStore';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useProtocolStore } from './useProtocolStore';
import { useReminderStore } from './useReminderStore';
import { useWorkoutStore } from './useWorkoutStore';

export {
  useAuthStore,
  useProfileStore,
  useLogStore,
  useWorkoutStore,
  useGamificationStore,
  useReminderStore,
  useProtocolStore,
};
export * from './useDailySummary';

/** Clear all per-user data from memory (called after account deletion). */
export function resetAllStores(): void {
  useProfileStore.getState().reset();
  useLogStore.getState().reset();
  useWorkoutStore.getState().reset();
  useGamificationStore.getState().reset();
  useReminderStore.getState().reset();
  useProtocolStore.getState().reset();
}
