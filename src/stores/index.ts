import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLEARED_ON_DELETE, STORE_KEYS, type StoreKey } from '../domain/storeKeys';
import { useActivityStore } from './useActivityStore';
import { useAuthStore } from './useAuthStore';
import { useBiomarkerStore } from './useBiomarkerStore';
import { useChallengeStore } from './useChallengeStore';
import { useCheckInStore } from './useCheckInStore';
import { useCoachStore } from './useCoachStore';
import { useCycleStore } from './useCycleStore';
import { useFoodStore } from './useFoodStore';
import { useGamificationStore } from './useGamificationStore';
import { useGearStore } from './useGearStore';
import { useIntegrationStore } from './useIntegrationStore';
import { useJournalStore } from './useJournalStore';
import { useLayoutStore } from './useLayoutStore';
import { useLogStore } from './useLogStore';
import { useMapStore } from './useMapStore';
import { useMealPlanStore } from './useMealPlanStore';
import { useProfileStore } from './useProfileStore';
import { useGymStore } from './useGymStore';
import { useProgramStore } from './useProgramStore';
import { useProtocolStore } from './useProtocolStore';
import { useReminderStore } from './useReminderStore';
import { useRouteStore } from './useRouteStore';
import { useRoutineStore } from './useRoutineStore';
import { useVitalsStore } from './useVitalsStore';
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

/**
 * Every store account deletion has to empty, keyed by its storage key.
 *
 * Typed as a complete record on purpose. This list was previously written out
 * by hand and had fallen twelve stores behind — blood results, cycle days and
 * journal entries, among the most private things in the app, survived a
 * deletion that told the user everything was gone. Keying it to `StoreKey`
 * means the compiler refuses to build the next time a store is added and not
 * named here.
 *
 * `auth` is excluded because signing out owns the session; deleting it from
 * under `deleteAccount` mid-call would cut off the request that does the
 * cloud-side deletion.
 */
const CLEARERS: Record<Exclude<StoreKey, 'auth'>, () => void> = {
  profile: () => useProfileStore.getState().reset(),
  logs: () => useLogStore.getState().reset(),
  workouts: () => useWorkoutStore.getState().reset(),
  gamification: () => useGamificationStore.getState().reset(),
  reminders: () => useReminderStore.getState().reset(),
  protocols: () => useProtocolStore.getState().reset(),
  // The coach thread is personal data like any other log.
  coach: () => useCoachStore.getState().reset(),
  programs: () => useProgramStore.getState().reset(),
  routines: () => useRoutineStore.getState().reset(),
  integrations: () => useIntegrationStore.getState().reset(),
  // Claims are a record of places the user has physically been, and the reset
  // turns location back off with them.
  gyms: () => useGymStore.getState().reset(),
  vitals: () => useVitalsStore.getState().clear(),
  journal: () => useJournalStore.getState().clear(),
  biomarkers: () => useBiomarkerStore.getState().clear(),
  cycle: () => {
    // Turned off as well as emptied: leaving the feature switched on would
    // announce, on the next account, something the user told this one.
    useCycleStore.getState().clear();
    useCycleStore.getState().setEnabled(false);
  },
  mealPlan: () => useMealPlanStore.getState().clear(),
  layout: () => useLayoutStore.getState().reset(),
  checkIns: () => useCheckInStore.getState().reset(),
  activities: () => useActivityStore.getState().reset(),
  map: () => useMapStore.getState().reset(),
  gear: () => useGearStore.getState().reset(),
  foods: () => useFoodStore.getState().reset(),
  routes: () => useRouteStore.getState().reset(),
  challenges: () => useChallengeStore.getState().reset(),
};


/**
 * Clear all per-user data from memory and from the device, after the account
 * has been deleted in the cloud.
 *
 * Both, not either. Resetting the stores alone races hydration: a store first
 * touched by this very call is still reading its old contents off disk, and
 * that read lands after the reset and writes the old data straight back.
 * Removing the keys means the next launch finds nothing regardless of who won.
 */
export async function resetAllStores(): Promise<void> {
  for (const clear of Object.values(CLEARERS)) clear();
  await AsyncStorage.multiRemove(CLEARED_ON_DELETE.map((k) => STORE_KEYS[k])).catch(() => {});
}
