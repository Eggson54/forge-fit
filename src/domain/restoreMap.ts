import type { StoreKey } from './storeKeys';

/**
 * How an export snapshot becomes a persisted store.
 *
 * The two shapes have drifted, and a restore that assumes they match would
 * corrupt data silently. Three specific traps this table exists to avoid:
 *
 * - The export renames fields (`coachSettings` for what the store calls
 *   `coach`, `personalRecords` for `prs`). Writing the export shape straight
 *   back drops them.
 * - The export redacts photo file paths, because photo bytes live on the
 *   device and the file is meant to be readable. Restoring those placeholders
 *   would replace every photo reference with the string
 *   "[stored on device]".
 * - The export carries the subscription tier. A file is trivially editable, so
 *   restoring entitlement from one is a free upgrade. Entitlement comes from
 *   the store, never from user-supplied data.
 *
 * A mapper returning null means "present in the file, deliberately not
 * restored"; `SKIP_REASON` says why, and the UI shows it.
 */
export type Restorer = (snapshot: Record<string, unknown>) => Record<string, unknown> | null;

const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export const SKIP_REASON: Partial<Record<StoreKey, string>> = {
  auth: 'Your sign-in is never replaced by a file.',
};

export const RESTORE_MAP: Record<Exclude<StoreKey, 'auth'>, Restorer> = {
  profile: (s) => ({
    ...pick(s, ['profile', 'targets', 'disciplineWeights', 'protocolFeatureEnabled']),
    // Renamed on the way out.
    ...(s.coachSettings !== undefined ? { coach: s.coachSettings } : null),
    // `subscription` is deliberately absent: see the note above.
  }),

  logs: (s) => ({
    ...pick(s, ['nutrition', 'water', 'weight', 'sleep', 'steps', 'measurements', 'savedMeals', 'cardio']),
    // Photos are not restored; their paths were redacted on the way out.
  }),

  workouts: (s) => ({
    ...pick(s, ['workouts', 'customExercises', 'favouriteExerciseIds']),
    ...(s.personalRecords !== undefined ? { prs: s.personalRecords } : null),
  }),

  gamification: (s) => pick(s, ['streaks', 'bestDisciplineScore', 'achievements']),

  // The export writes the array itself, the store wraps it.
  reminders: (s) => (Array.isArray(s) ? { reminders: s } : pick(s, ['reminders'])),
  routines: (s) => (Array.isArray(s) ? { routines: s } : pick(s, ['routines'])),

  protocols: (s) => pick(s, ['protocols', 'logs']),
  coach: (s) => (s.conversation !== undefined ? { turns: s.conversation } : pick(s, ['turns'])),
  programs: (s) => pick(s, ['enrolment']),
  // Connection state, not tokens: those live in the keychain and are never
  // exported, so a restored file cannot hand somebody else's Strava account
  // to a new device.
  integrations: (s) => pick(s, ['providers', 'activities', 'watchStatus']),
  vitals: (s) => pick(s, ['days']),
  journal: (s) => pick(s, ['entries', 'customFactors', 'enabledKeys']),
  biomarkers: (s) => pick(s, ['readings']),
  cycle: (s) => pick(s, ['enabled', 'days']),
  mealPlan: (s) => pick(s, ['plan', 'checked']),
  layout: (s) => pick(s, ['order', 'hidden', 'hiddenTabs', 'action']),
  checkIns: (s) => pick(s, ['checkIns', 'ghost', 'thinking']),
  activities: (s) => pick(s, ['activities', 'segments', 'segmentEfforts']),
  map: (s) => pick(s, ['zones', 'sourceId', 'heatmapEnabled']),
  gear: (s) => pick(s, ['gear', 'uses', 'goals']),
  foods: (s) => pick(s, ['mine']),
  gyms: (s) => pick(s, ['claims', 'kits']),
};

/** Fields the export carries and a restore deliberately drops, for the UI. */
export const NOT_RESTORED: { key: Exclude<StoreKey, 'auth'>; what: string; why: string }[] = [
  {
    key: 'profile',
    what: 'Subscription tier',
    why: 'Entitlement comes from the app store, not from a file anyone could edit.',
  },
  {
    key: 'logs',
    what: 'Progress photos',
    why: 'Photo files stay on the device, so the export only ever held their dates.',
  },
];
