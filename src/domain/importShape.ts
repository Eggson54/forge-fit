import { STORE_KEYS, UNEXPORTED_STORES, type StoreKey } from './storeKeys';

/**
 * Validating a file someone hands back to the app.
 *
 * Restoring data is the most destructive thing the app can do, so this module
 * exists to be paranoid on its behalf: it reports what a file contains before
 * anything is replaced, and refuses anything it cannot recognise rather than
 * merging a half-understood object into the user's history.
 */

export interface ImportReport {
  ok: boolean;
  /** Why it was rejected. Empty when ok. */
  problems: string[];
  version: number | null;
  exportedAt: string | null;
  /** Per-store record counts, for the confirmation screen. */
  counts: { key: StoreKey; label: string; records: number }[];
  /** Keys present in the file that this build does not know about. */
  unknownKeys: string[];
}

const LABEL: Record<StoreKey, string> = {
  auth: 'Account session',
  profile: 'Profile and targets',
  logs: 'Food, water, weight, sleep, steps',
  workouts: 'Workouts and records',
  gamification: 'Streaks and achievements',
  reminders: 'Reminders',
  protocols: 'Protocols',
  coach: 'Coach conversation',
  programs: 'Training plan',
  routines: 'Routines',
  integrations: 'Connected services',
  gyms: 'Gyms and claims',
  vitals: 'Resting heart rate, HRV and the other passive signals',
  journal: 'Journal entries and your own factors',
  biomarkers: 'Blood results you entered',
  cycle: 'Cycle tracking',
  mealPlan: 'Meal plan and shopping list',
  layout: 'Home screen layout',
  checkIns: 'Check-in schedule and Ghost Mode',
  activities: 'Recorded routes, segments and segment times',
  map: 'Privacy zones and map preferences',
  routes: 'Routes you planned',
  challenges: 'Targets you set yourself',
  gear: 'Shoes, bikes and your goals',
  foods: 'Your own foods and scanned barcodes',
};

/** Counts records in a store snapshot, however it is shaped. */
function countRecords(snapshot: unknown): number {
  if (Array.isArray(snapshot)) return snapshot.length;
  if (!snapshot || typeof snapshot !== 'object') return 0;
  let total = 0;
  for (const value of Object.values(snapshot as Record<string, unknown>)) {
    if (Array.isArray(value)) total += value.length;
    else if (value && typeof value === 'object') total += 1;
  }
  return total;
}

export function inspectImport(raw: unknown): ImportReport {
  const problems: string[] = [];
  const empty: ImportReport = {
    ok: false,
    problems,
    version: null,
    exportedAt: null,
    counts: [],
    unknownKeys: [],
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push('That file is not a ForgeFit export.');
    return empty;
  }

  const doc = raw as Record<string, unknown>;
  if (doc.app !== 'ForgeFit') {
    problems.push('That file was not exported from ForgeFit.');
    return empty;
  }

  const version = typeof doc.version === 'number' ? doc.version : null;
  if (version == null) {
    problems.push('The file has no version, so its contents cannot be trusted.');
    return empty;
  }

  const known = Object.keys(STORE_KEYS) as StoreKey[];
  const counts = known
    .filter((k) => !UNEXPORTED_STORES.includes(k))
    .map((key) => ({ key, label: LABEL[key], records: countRecords(doc[key]) }))
    .filter((c) => c.records > 0);

  const reserved = new Set<string>([...known, 'app', 'version', 'exportedAt']);
  const unknownKeys = Object.keys(doc).filter((k) => !reserved.has(k));

  if (counts.length === 0) {
    problems.push('The file is a valid export but contains no records.');
  }

  return {
    ok: problems.length === 0,
    problems,
    version,
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : null,
    counts,
    unknownKeys,
  };
}

/**
 * Whether this build can read a file of that version.
 *
 * Forward compatibility is refused deliberately. A newer export may contain
 * fields this build will silently drop, and a restore that quietly loses data
 * is worse than one that will not run.
 */
export function canImport(version: number | null, current: number): boolean {
  return version != null && version <= current;
}
