import { useAuthStore } from './useAuthStore';
import { useCoachStore } from './useCoachStore';
import { useGamificationStore } from './useGamificationStore';
import { useIntegrationStore } from './useIntegrationStore';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useProtocolStore } from './useProtocolStore';
import { useReminderStore } from './useReminderStore';
import { useRoutineStore } from './useRoutineStore';
import { useWorkoutStore } from './useWorkoutStore';

export {
  useAuthStore,
  useCoachStore,
  useProfileStore,
  useLogStore,
  useWorkoutStore,
  useGamificationStore,
  useReminderStore,
  useProtocolStore,
  useIntegrationStore,
  useRoutineStore,
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
  useIntegrationStore.getState().reset();
  useRoutineStore.getState().reset();
  // The coach thread is personal data like any other log: account deletion has
  // to take it too.
  useCoachStore.getState().reset();
}
