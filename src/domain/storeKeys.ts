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
} as const;

export type StoreKey = keyof typeof STORE_KEYS;

/**
 * Stores deliberately left out of a data export.
 *
 * Auth holds session credentials, not the user's own records — exporting it
 * would hand a copy of their session to wherever the file goes.
 */
export const UNEXPORTED_STORES: readonly StoreKey[] = ['auth'];
