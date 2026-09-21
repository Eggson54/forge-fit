import { Platform } from 'react-native';

/**
 * Apple Health on iOS, Health Connect on Android.
 *
 * Both are native frameworks. There is no JavaScript path to either, which
 * means three things this module exists to keep straight:
 *
 *  1. In Expo Go and on the web there is no native module at all, and the only
 *     honest answer to "what is my resting heart rate" is that we cannot see
 *     it. This returns null rather than a plausible number.
 *  2. The native library is loaded with `require` inside a try, at call time.
 *     A static import would break the web bundle outright.
 *  3. Permission in HealthKit is per type and is *write-blind*: Apple will not
 *     tell an app whether a read was denied, only whether it was asked. So a
 *     granted permission plus zero samples is genuinely ambiguous, and this
 *     module reports "no data" rather than "denied".
 *
 * Install for a development build:
 *   npx expo install @kingstinct/react-native-healthkit
 *   npx expo install react-native-health-connect   # Android
 *   npx expo run:ios
 */

export type HealthMetric =
  | 'steps'
  | 'weight'
  | 'workouts'
  | 'sleep'
  | 'heartRate'
  | 'restingHeartRate'
  | 'hrv'
  | 'respiratoryRate'
  | 'bodyTemperature'
  | 'oxygenSaturation'
  | 'activeEnergy'
  | 'vo2Max';

export const METRIC_LABEL: Record<HealthMetric, string> = {
  steps: 'Steps',
  weight: 'Weight',
  workouts: 'Workouts',
  sleep: 'Sleep',
  heartRate: 'Heart rate',
  restingHeartRate: 'Resting heart rate',
  hrv: 'Heart rate variability',
  respiratoryRate: 'Respiratory rate',
  bodyTemperature: 'Wrist temperature',
  oxygenSaturation: 'Blood oxygen',
  activeEnergy: 'Active energy',
  vo2Max: 'VO₂ max',
};

/**
 * HealthKit's identifiers and the unit each query must ask for.
 *
 * The unit is not optional in practice. Ask HealthKit for a quantity without
 * naming a unit and you get its canonical one, which is not always the one
 * you assumed — body temperature comes back in degrees C or F depending on
 * nothing you control, and oxygen saturation is a fraction rather than a
 * percentage. Naming the unit makes the number mean what the rest of the app
 * thinks it means.
 */
const HK_READ: Record<HealthMetric, string> = {
  steps: 'HKQuantityTypeIdentifierStepCount',
  weight: 'HKQuantityTypeIdentifierBodyMass',
  workouts: 'HKWorkoutTypeIdentifier',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  respiratoryRate: 'HKQuantityTypeIdentifierRespiratoryRate',
  bodyTemperature: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
  oxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  vo2Max: 'HKQuantityTypeIdentifierVO2Max',
};

const HK_UNIT: Partial<Record<HealthMetric, string>> = {
  steps: 'count',
  weight: 'kg',
  heartRate: 'count/min',
  restingHeartRate: 'count/min',
  hrv: 'ms',
  respiratoryRate: 'count/min',
  bodyTemperature: 'degC',
  oxygenSaturation: '%',
  activeEnergy: 'kcal',
  vo2Max: 'ml/(kg*min)',
};

export interface DailyHealth {
  date: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  respiratoryRate: number | null;
  wristTemperatureC: number | null;
  oxygenSaturationPct: number | null;
  sleepMinutes: number | null;
}

export const EMPTY_DAY: Omit<DailyHealth, 'date'> = {
  steps: null,
  activeEnergyKcal: null,
  restingHeartRate: null,
  hrvMs: null,
  respiratoryRate: null,
  wristTemperatureC: null,
  oxygenSaturationPct: null,
  sleepMinutes: null,
};

export interface HealthProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  requestPermissions(metrics: HealthMetric[]): Promise<Record<string, boolean>>;
  readDay(date: string): Promise<DailyHealth>;
  getLatestWeightKg(): Promise<number | null>;
}

/** What runs when there is no native framework to talk to. */
class NoHealthProvider implements HealthProvider {
  readonly name = 'unavailable';
  async isAvailable() {
    return false;
  }
  async requestPermissions(metrics: HealthMetric[]) {
    return Object.fromEntries(metrics.map((m) => [m, false]));
  }
  async readDay(date: string): Promise<DailyHealth> {
    return { date, ...EMPTY_DAY };
  }
  async getLatestWeightKg() {
    return null;
  }
}

/**
 * The real iOS provider, over `@kingstinct/react-native-healthkit`.
 *
 * Every read is wrapped: a missing permission, a type the device does not
 * record (no Watch means no HRV and no wrist temperature) and a genuinely
 * empty day all surface as null, and none of them should take the app down.
 */
type Dialect = 'v7' | 'v16';

class HealthKitProvider implements HealthProvider {
  readonly name = 'healthkit';

  /**
   * Identifiers this session has actually requested.
   *
   * Not bookkeeping — a guard. The library's own README is blunt about it:
   * querying a type you have not requested authorization for *crashes the
   * app*. The user's grant survives a relaunch but the library's knowledge of
   * it does not, so nothing is ever queried unless it is in this set and
   * `ensureRequested` fills it on demand.
   */
  private requested = new Set<string>();

  constructor(
    private readonly hk: HealthKitModule,
    private readonly dialect: Dialect,
  ) {}

  async isAvailable() {
    try {
      return await this.hk.isHealthDataAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Ask for read access, in whichever shape this version wants.
   *
   * Version 7 takes two positional arrays; version 16 takes
   * `{ toRead, toShare }`. The dialect is decided once, by looking for an
   * export only the newer one has — not by trying one and catching, because
   * v7 handed an object would quietly request *nothing* and then crash on the
   * first query.
   */
  private async authorize(identifiers: string[]): Promise<boolean> {
    try {
      if (this.dialect === 'v16') {
        await this.hk.requestAuthorization({ toRead: identifiers });
      } else {
        await this.hk.requestAuthorization(identifiers, []);
      }
      for (const id of identifiers) this.requested.add(id);
      return true;
    } catch {
      return false;
    }
  }

  async requestPermissions(metrics: HealthMetric[]) {
    const ok = await this.authorize(metrics.map((m) => HK_READ[m]));
    // HealthKit deliberately does not reveal read denials — telling an app
    // "denied" would itself leak that the user has data of that type. So this
    // reports what was asked for, and a metric that comes back empty is
    // reported as no data rather than as a refusal.
    return Object.fromEntries(metrics.map((m) => [m, ok]));
  }

  /** Request a type if this session has not already, so a query is safe. */
  private async ensureRequested(metric: HealthMetric): Promise<boolean> {
    const id = HK_READ[metric];
    if (this.requested.has(id)) return true;
    return this.authorize([id]);
  }

  /** The window argument, in whichever shape this version wants. */
  private window(start: Date, end: Date, unit?: string): Record<string, unknown> {
    return this.dialect === 'v16'
      ? { filter: { date: { startDate: start, endDate: end } }, limit: 0, ...(unit ? { unit } : null) }
      : { from: start, to: end, limit: 0, ...(unit ? { unit } : null) };
  }

  private async samples(metric: HealthMetric, date: string): Promise<number[]> {
    if (!(await this.ensureRequested(metric))) return [];
    try {
      const { start, end } = dayBounds(date);
      const rows = await this.hk.queryQuantitySamples(
        HK_READ[metric],
        this.window(start, end, HK_UNIT[metric]),
      );
      // v16 returns the array; some versions wrap it as { samples }. Both are
      // accepted rather than assumed.
      const list = Array.isArray(rows) ? rows : (rows as { samples?: unknown })?.samples;
      if (!Array.isArray(list)) return [];
      return list
        .map((r) => normaliseQuantity(metric, (r as { quantity?: number }).quantity))
        .filter((n): n is number => n != null);
    } catch {
      return [];
    }
  }

  private async sum(metric: HealthMetric, date: string): Promise<number | null> {
    const values = await this.samples(metric, date);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
  }

  private async mean(metric: HealthMetric, date: string): Promise<number | null> {
    const values = await this.samples(metric, date);
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  }

  async readDay(date: string): Promise<DailyHealth> {
    const [steps, energy, rhr, hrv, resp, temp, spo2, sleep] = await Promise.all([
      this.sum('steps', date),
      this.sum('activeEnergy', date),
      this.mean('restingHeartRate', date),
      this.mean('hrv', date),
      this.mean('respiratoryRate', date),
      this.mean('bodyTemperature', date),
      this.mean('oxygenSaturation', date),
      this.sleepMinutes(date),
    ]);
    return {
      date,
      steps: steps == null ? null : Math.round(steps),
      activeEnergyKcal: energy == null ? null : Math.round(energy),
      restingHeartRate: rhr == null ? null : Math.round(rhr),
      hrvMs: hrv == null ? null : Math.round(hrv),
      respiratoryRate: resp == null ? null : Math.round(resp * 10) / 10,
      wristTemperatureC: temp == null ? null : Math.round(temp * 100) / 100,
      oxygenSaturationPct: spo2 == null ? null : Math.round(spo2 * 10) / 10,
      sleepMinutes: sleep,
    };
  }

  private async sleepMinutes(date: string): Promise<number | null> {
    if (!(await this.ensureRequested('sleep'))) return null;
    try {
      // A night is attributed to the day you wake up, so the window runs from
      // 6pm the evening before to 11am. Reading midnight-to-midnight splits
      // every normal night in two.
      const { start } = dayBounds(date);
      const from = new Date(start);
      from.setDate(from.getDate() - 1);
      from.setHours(18, 0, 0, 0);
      const to = new Date(start);
      to.setHours(11, 0, 0, 0);

      const rows = await this.hk.queryCategorySamples(HK_READ.sleep, this.window(from, to));
      const list = Array.isArray(rows) ? rows : (rows as { samples?: unknown })?.samples;
      if (!Array.isArray(list) || list.length === 0) return null;
      // 1 is asleep-unspecified and 3, 4, 5 are core, deep and REM. 0 is "in
      // bed" and 2 is "awake": counting those would credit an hour of lying
      // there reading.
      const asleep = (list as { value: number; startDate: string; endDate: string }[]).filter((r) =>
        [1, 3, 4, 5].includes(r.value),
      );
      const ms = asleep.reduce(
        (a, r) => a + (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()),
        0,
      );
      return ms > 0 ? Math.round(ms / 60000) : null;
    } catch {
      return null;
    }
  }

  async getLatestWeightKg(): Promise<number | null> {
    if (!(await this.ensureRequested('weight'))) return null;
    try {
      const sample = await this.hk.getMostRecentQuantitySample(HK_READ.weight, 'kg');
      return sample?.quantity ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Fix up a raw quantity where the unit alone is not enough.
 *
 * HealthKit's percent unit is a *fraction*: 0.97, not 97. Whether a given
 * version normalises it is not something to rely on, so anything at or below
 * 1 is read as a fraction and scaled. A real blood-oxygen reading is never 1%
 * and never 0.97%, so the test cannot misfire.
 */
function normaliseQuantity(metric: HealthMetric, quantity: number | undefined): number | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return null;
  if (metric === 'oxygenSaturation') return quantity <= 1 ? quantity * 100 : quantity;
  return quantity;
}

function dayBounds(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { start, end };
}

/**
 * The slice of `@kingstinct/react-native-healthkit` this app uses, written
 * against the published types of both supported majors rather than from
 * memory — every one of these signatures was wrong the first time.
 *
 * v7 (React 18 / RN 0.76, which is what this project is on) takes positional
 * arrays and a flat `{ from, to }`. v16 (React 19 / RN 0.79) takes
 * `{ toRead }` and nests the window under `filter.date`. The provider picks
 * between them once, from a marker export.
 */
interface HealthKitModule {
  isHealthDataAvailable(): Promise<boolean>;
  requestAuthorization(read: string[] | { toRead?: string[]; toShare?: string[] }, write?: string[]): Promise<unknown>;
  queryQuantitySamples(identifier: string, options: Record<string, unknown>): Promise<unknown>;
  queryCategorySamples(identifier: string, options: Record<string, unknown>): Promise<unknown>;
  getMostRecentQuantitySample(identifier: string, unit?: string): Promise<{ quantity?: number } | null>;
}

let provider: HealthProvider = new NoHealthProvider();
let resolved = false;

/**
 * Swap in the native provider if this build has one.
 *
 * Called once at startup and again whenever the integrations screen opens, so
 * a user who installs a development build does not have to know to restart.
 */
export function ensureNative(): void {
  if (resolved) return;
  resolved = true;
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@kingstinct/react-native-healthkit');
    // The package publishes both named exports and a default object holding
    // all of them, and which arrives depends on interop. Taking the default
    // when it has the methods and the namespace otherwise covers both.
    const candidate = (mod?.default && typeof mod.default.isHealthDataAvailable === 'function'
      ? mod.default
      : mod) as Record<string, unknown> | undefined;

    // Every method is checked, not just the first. A partial module — a
    // version whose API moved under us — falls back to "unavailable" rather
    // than failing at the moment somebody taps Connect.
    const complete =
      candidate &&
      (['isHealthDataAvailable', 'requestAuthorization', 'queryQuantitySamples', 'queryCategorySamples'] as const).every(
        (fn) => typeof candidate[fn] === 'function',
      );

    if (!complete) {
      nativeLoadError =
        'The HealthKit module is installed but its API does not match what this build expects.';
      return;
    }

    // `currentAppSource` arrived in the v16 rewrite and does not exist in v7,
    // so it is a positive signal rather than a guess. This matters: v7 handed
    // a v16-shaped authorization object would quietly request nothing and
    // then crash on the first query.
    const dialect: Dialect = typeof candidate.currentAppSource === 'function' ? 'v16' : 'v7';
    provider = new HealthKitProvider(candidate as unknown as HealthKitModule, dialect);
    nativeDialect = dialect;
    nativeLoadError = null;
  } catch (e) {
    nativeLoadError = (e as Error)?.message ?? 'HealthKit module not present in this build.';
  }
}

let nativeDialect: Dialect | null = null;
/** Which major of the HealthKit library loaded, for the diagnostics screen. */
export function healthDialect(): Dialect | null {
  ensureNative();
  return nativeDialect;
}

/** Why the native module did not load, for the diagnostics screen. */
let nativeLoadError: string | null = null;
export function healthLoadError(): string | null {
  ensureNative();
  return nativeLoadError;
}

export const health = {
  /** True once a native framework has been found and swapped in. */
  get hasNativeModule() {
    ensureNative();
    return provider.name !== 'unavailable';
  },
  provider: () => {
    ensureNative();
    return provider;
  },
  isAvailable: () => health.provider().isAvailable(),
  requestPermissions: (m: HealthMetric[]) => health.provider().requestPermissions(m),
  readDay: (date: string) => health.provider().readDay(date),
  getLatestWeightKg: () => health.provider().getLatestWeightKg(),
};

/** Only for tests: put a provider in and take it out again. */
export function setHealthProvider(p: HealthProvider | null): void {
  provider = p ?? new NoHealthProvider();
  resolved = true;
}
