/**
 * Storage keys for every persisted store, kept free of React Native imports so
 * the data-export shape can be checked without booting the app.
 */
export const STORE_KEYS = {
  auth: 'forgefit.auth',
  profile: 'forgefit.profile',
  logs: 'forgefit.logs',
  workouts: 'forgefit.workouts',
  gamification: 'forgefit.gamification',
  reminders: 'forgefit.reminders',
  protocols: 'forgefit.protocols',
  coach: 'forgefit.coach',
  programs: 'forgefit.programs',
  routines: 'forgefit.routines',
  integrations: 'forgefit.integrations',
  gyms: 'forgefit.gyms',
  vitals: 'forgefit.vitals',
  journal: 'forgefit.journal',
  biomarkers: 'forgefit.biomarkers',
  cycle: 'forgefit.cycle',
  mealPlan: 'forgefit.mealplan',
  layout: 'forgefit.layout',
  checkIns: 'forgefit.checkins',
  activities: 'forgefit.activities',
  map: 'forgefit.map',
  gear: 'forgefit.gear',
  foods: 'forgefit.foods',
  routes: 'forgefit.routes',
} as const;

export type StoreKey = keyof typeof STORE_KEYS;

/**
 * Stores deliberately left out of a data export.
 *
 * Auth holds session credentials, not the user's own records — exporting it
 * would hand a copy of their session to wherever the file goes.
 */
export const UNEXPORTED_STORES: readonly StoreKey[] = ['auth'];

/**
 * Stores that account deletion must empty.
 *
 * Everything except the session itself, which signing out owns — deleting it
 * from under `deleteAccount` would cut off the request doing the cloud-side
 * deletion. Derived rather than listed, because the hand-written version of
 * this had fallen twelve stores behind, and blood results, cycle days and
 * journal entries survived a deletion that told the user everything was gone.
 */
export const CLEARED_ON_DELETE: readonly Exclude<StoreKey, 'auth'>[] = (
  Object.keys(STORE_KEYS) as StoreKey[]
).filter((k): k is Exclude<StoreKey, 'auth'> => k !== 'auth');
