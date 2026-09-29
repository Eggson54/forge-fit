/**
 * What is configured, what is not, and what each thing actually buys.
 *
 * The point of this module is to be honest in the unflattering direction.
 * Every integration in this app degrades to something usable when its
 * configuration is absent, so the interesting question is never "is it
 * broken" — it is "which of these is quietly running on a mock, and did I
 * mean for it to be". A checklist that only ever says "missing" in red
 * teaches people to ignore red.
 *
 * So every requirement carries a `without`: what the app does when this is
 * not set up. Several of those are genuinely fine, and the checker says so
 * rather than implying a fully configured install is the only correct one.
 *
 * Kept free of any React Native import so it can be run from a script and
 * tested without booting the app.
 */

export type Where = 'app' | 'server';

export interface RequiredVar {
  name: string;
  where: Where;
  /**
   * False for a var that only widens an already-working setup — an Android
   * key when the app ships on iOS, say. A group with all of its required
   * vars set is ready even if these are missing.
   */
  required: boolean;
  note?: string;
}

export interface Requirement {
  id: string;
  title: string;
  /** What having it set up gets you. */
  unlocks: string;
  /** What happens when it is not set up. Never "it breaks", unless it does. */
  without: string;
  /** True when the app is honestly usable without this. */
  optional: boolean;
  vars: RequiredVar[];
  /** Where in SETUP.md to read about it. */
  section: string;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: 'supabase',
    title: 'Supabase',
    unlocks: 'Accounts, sync between devices, the social side, and deleting an account for real.',
    without: 'Everything is local to one device and there is nobody to follow. Nothing is lost, but nothing leaves the phone either.',
    optional: true,
    section: '1. Supabase',
    vars: [
      { name: 'EXPO_PUBLIC_SUPABASE_URL', where: 'app', required: true },
      { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', where: 'app', required: true },
      {
        name: 'SUPABASE_URL',
        where: 'server',
        required: true,
        note: 'How the backends check a session: the AI server reads the project\'s signing keys from it, and the wearables functions ask it who is calling.',
      },
      {
        name: 'SUPABASE_JWT_SECRET',
        where: 'server',
        required: false,
        note: 'Only for projects still on the older shared-secret keys. Newer projects need just SUPABASE_URL.',
      },
    ],
  },
  {
    id: 'ai',
    title: 'The AI coach',
    unlocks: 'The coach, photo food estimates, and the weekly review.',
    without: 'The coach is unavailable and food photos fall back to searching by name. The rest of the app is untouched.',
    optional: true,
    section: '6. Your AI backend',
    vars: [
      { name: 'EXPO_PUBLIC_AI_API_URL', where: 'app', required: true },
      {
        name: 'ANTHROPIC_API_KEY',
        where: 'server',
        required: true,
        note: 'On the backend only. A key in the app is a key anybody can read out of the bundle.',
      },
    ],
  },
  {
    id: 'usda',
    title: 'USDA FoodData Central',
    unlocks: 'The reference food database: whole foods with proper nutrient data.',
    without: 'Food search falls back to Open Food Facts, which is strong on packets and weak on plain ingredients.',
    optional: true,
    section: '8. USDA FoodData Central',
    vars: [
      { name: 'EXPO_PUBLIC_USDA_FOOD_URL', where: 'app', required: true },
      {
        name: 'USDA_FDC_API_KEY',
        where: 'server',
        required: true,
        note: 'Free, instant, and rate-limited per key — which is why it lives on the backend and not in the app.',
      },
    ],
  },
  {
    id: 'strava',
    title: 'Strava',
    unlocks: 'Importing runs and rides recorded in Strava.',
    without: 'Nothing comes in from Strava. Anything that reaches Apple Health still arrives, Garmin included.',
    optional: true,
    section: '2. Strava',
    vars: [
      { name: 'EXPO_PUBLIC_STRAVA_CLIENT_ID', where: 'app', required: true },
      { name: 'EXPO_PUBLIC_STRAVA_EXCHANGE_URL', where: 'app', required: true },
      {
        name: 'STRAVA_CLIENT_SECRET',
        where: 'server',
        required: true,
        note: 'Never in the app. The secret is what lets anybody act as your Strava application.',
      },
    ],
  },
  {
    id: 'wearables',
    title: 'Open Wearables',
    unlocks: 'Garmin, WHOOP, Oura and the rest, read directly rather than through Apple Health.',
    without: 'Those devices still arrive through Apple Health, which is where most of them write anyway.',
    optional: true,
    section: '7. Open Wearables',
    vars: [
      { name: 'EXPO_PUBLIC_OPEN_WEARABLES_SUMMARY_URL', where: 'app', required: true },
      { name: 'OPEN_WEARABLES_URL', where: 'server', required: true },
      { name: 'OPEN_WEARABLES_API_KEY', where: 'server', required: true },
      {
        name: 'SUPABASE_SERVICE_ROLE_KEY',
        where: 'server',
        required: true,
        note: 'Creates the link between an account and its wearables profile — the one write no client is allowed to make.',
      },
      { name: 'SUPABASE_ANON_KEY', where: 'server', required: true },
    ],
  },
  {
    id: 'revenuecat',
    title: 'RevenueCat',
    unlocks: 'Subscriptions, and the entitlement that turns the free tier off.',
    without: 'Everything behaves as the paid tier against a mock. Fine for development, not for shipping.',
    optional: true,
    section: '4. RevenueCat',
    vars: [
      { name: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY', where: 'app', required: true },
      {
        name: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
        where: 'app',
        required: false,
        note: 'Only if you ship on Android.',
      },
    ],
  },
  {
    id: 'ads',
    title: 'AdMob',
    unlocks: "The free tier's banners.",
    without: 'No ads anywhere, which is also what a paid subscriber sees.',
    optional: true,
    section: '5. AdMob',
    vars: [
      { name: 'EXPO_PUBLIC_ADMOB_IOS_BANNER', where: 'app', required: true },
      { name: 'EXPO_PUBLIC_ADMOB_ANDROID_BANNER', where: 'app', required: false },
    ],
  },
  {
    id: 'gyms',
    title: 'Gym search',
    unlocks: 'Finding real gyms near you.',
    without: 'The gym map shows sample venues and says so on the screen.',
    optional: true,
    section: '10. Gym search',
    vars: [{ name: 'EXPO_PUBLIC_GYM_API_URL', where: 'app', required: true }],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    unlocks: 'Product analytics.',
    without: 'Nothing is sent anywhere. This is the one on this list that is arguably better left off.',
    optional: true,
    section: '11. Analytics',
    vars: [{ name: 'EXPO_PUBLIC_ANALYTICS_KEY', where: 'app', required: true }],
  },
];

/**
 * Things that need no configuration at all.
 *
 * Listed because "what do I need to set up" has a real and surprisingly long
 * answer of "not this", and somebody reading a list of nine integrations
 * deserves to know how much of the app is already working.
 */
export const NEEDS_NOTHING = [
  'Workouts, sets, records and programmes',
  'Food logging, and barcode scanning through Open Food Facts',
  'Recording a route with the phone’s GPS, and privacy zones',
  'Route planning, and exporting a route as GPX',
  'Challenges',
  'Apple Health and Apple Watch, including the sleep score',
  'Photos on an activity',
  'Everything on the progress, body and journal screens',
  'Exporting and re-importing all of your own data',
];

export type Status = 'ready' | 'partial' | 'absent';

export interface RequirementResult {
  requirement: Requirement;
  status: Status;
  /** Required vars that are not set. */
  missing: RequiredVar[];
  /** Optional vars that are not set. Never affects the status. */
  missingOptional: RequiredVar[];
}

const isSet = (env: Record<string, string | undefined>, name: string): boolean => {
  const value = env[name];
  return typeof value === 'string' && value.trim().length > 0;
};

export function checkRequirement(
  requirement: Requirement,
  env: Record<string, string | undefined>,
): RequirementResult {
  const missing = requirement.vars.filter((v) => v.required && !isSet(env, v.name));
  const missingOptional = requirement.vars.filter((v) => !v.required && !isSet(env, v.name));
  const required = requirement.vars.filter((v) => v.required);

  // Three states rather than two, because a half-configured integration is
  // the failure worth shouting about: nothing degrades gracefully into
  // "half a Strava connection", it just fails at the moment somebody uses it.
  const status: Status =
    missing.length === 0 ? 'ready' : missing.length === required.length ? 'absent' : 'partial';

  return { requirement, status, missing, missingOptional };
}

export function checkSetup(env: Record<string, string | undefined>): RequirementResult[] {
  return REQUIREMENTS.map((r) => checkRequirement(r, env));
}

export interface SetupSummary {
  ready: number;
  partial: number;
  absent: number;
  total: number;
  /** Half-configured integrations, which are the only real errors here. */
  broken: RequirementResult[];
  headline: string;
}

export function summarise(results: RequirementResult[]): SetupSummary {
  const ready = results.filter((r) => r.status === 'ready').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const absent = results.filter((r) => r.status === 'absent').length;
  const broken = results.filter((r) => r.status === 'partial');

  const headline =
    partial > 0
      ? `${partial} ${partial === 1 ? 'integration is' : 'integrations are'} half configured. That is the one state that fails at runtime rather than falling back.`
      : ready === results.length
        ? 'Everything on the list is configured.'
        : ready === 0
          ? 'Nothing is configured, and the app still runs — everything below falls back to something usable.'
          : `${ready} of ${results.length} configured. The rest fall back to something usable.`;

  return { ready, partial, absent, total: results.length, broken, headline };
}

/**
 * Environment variables read by the app, parsed out of a .env file.
 *
 * Deliberately forgiving: `export FOO=bar`, quoted values, blank lines and
 * `#` comments are all things people really put in these files, and a parser
 * that choked on them would report a correctly configured install as empty,
 * which is the worst answer this tool can give.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * A value that is present but is obviously a placeholder.
 *
 * Copying the example file and forgetting to fill it in produces an install
 * that reports itself fully configured and fails on first use, which is
 * exactly the failure this whole module exists to catch.
 */
export function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return (
    v.startsWith('your-') ||
    v.startsWith('your_') ||
    v.includes('replace-me') ||
    v.includes('changeme') ||
    v === 'xxx' ||
    v === 'todo' ||
    /^<.*>$/.test(v)
  );
}

export function placeholders(env: Record<string, string | undefined>): string[] {
  const known = new Set(REQUIREMENTS.flatMap((r) => r.vars.map((v) => v.name)));
  return [...known].filter((name) => {
    const value = env[name];
    return typeof value === 'string' && looksLikePlaceholder(value);
  });
}
