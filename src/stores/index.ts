import { useAuthStore } from './useAuthStore';
import { useCoachStore } from './useCoachStore';
import { useGamificationStore } from './useGamificationStore';
import { useIntegrationStore } from './useIntegrationStore';
import { useLogStore } from './useLogStore';
import { useProfileStore } from './useProfileStore';
import { useGymStore } from './useGymStore';
import { useProgramStore } from './useProgramStore';
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
  useGymStore,
  useReminderStore,
  useProtocolStore,
  useIntegrationStore,
  useRoutineStore,
  useProgramStore,
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
  useProgramStore.getState().reset();
  // Claims are a record of places the user has physically been. Deleting the
  // account has to take that with it, and turn location back off.
  useGymStore.getState().reset();
}
