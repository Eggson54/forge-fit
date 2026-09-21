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

/** HealthKit's own identifiers, kept next to ours so the mapping is one place. */
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
class HealthKitProvider implements HealthProvider {
  readonly name = 'healthkit';
  constructor(private readonly hk: HealthKitModule) {}

  async isAvailable() {
    try {
      return await this.hk.isHealthDataAvailable();
    } catch {
      return false;
    }
  }

  async requestPermissions(metrics: HealthMetric[]) {
    const identifiers = metrics.map((m) => HK_READ[m]);
    try {
      await this.hk.requestAuthorization(identifiers, []);
    } catch {
      return Object.fromEntries(metrics.map((m) => [m, false]));
    }
    // HealthKit deliberately does not reveal read denials — telling an app
    // "denied" would itself leak that the user has data of that type. So this
    // reports what was asked for, and a metric that comes back empty is
    // reported as no data rather than as a refusal.
    return Object.fromEntries(metrics.map((m) => [m, true]));
  }

  private async sum(identifier: string, date: string): Promise<number | null> {
    try {
      const { start, end } = dayBounds(date);
      const samples = await this.hk.queryQuantitySamples(identifier, { from: start, to: end });
      if (!samples || samples.length === 0) return null;
      return samples.reduce((a, s) => a + (s.quantity ?? 0), 0);
    } catch {
      return null;
    }
  }

  private async mean(identifier: string, date: string): Promise<number | null> {
    try {
      const { start, end } = dayBounds(date);
      const samples = await this.hk.queryQuantitySamples(identifier, { from: start, to: end });
      if (!samples || samples.length === 0) return null;
      return samples.reduce((a, s) => a + (s.quantity ?? 0), 0) / samples.length;
    } catch {
      return null;
    }
  }

  async readDay(date: string): Promise<DailyHealth> {
    const [steps, energy, rhr, hrv, resp, temp, spo2, sleep] = await Promise.all([
      this.sum(HK_READ.steps, date),
      this.sum(HK_READ.activeEnergy, date),
      this.mean(HK_READ.restingHeartRate, date),
      this.mean(HK_READ.hrv, date),
      this.mean(HK_READ.respiratoryRate, date),
      this.mean(HK_READ.bodyTemperature, date),
      this.mean(HK_READ.oxygenSaturation, date),
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
      // HealthKit stores oxygen saturation as a fraction, not a percentage.
      oxygenSaturationPct: spo2 == null ? null : Math.round(spo2 * 1000) / 10,
      sleepMinutes: sleep,
    };
  }

  private async sleepMinutes(date: string): Promise<number | null> {
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

      const samples = await this.hk.queryCategorySamples(HK_READ.sleep, { from, to });
      if (!samples || samples.length === 0) return null;
      // Values 3, 4 and 5 are core, deep and REM. 0 is "in bed" and 2 is
      // "awake": counting those would credit an hour of lying there reading.
      const asleep = samples.filter((s) => [1, 3, 4, 5].includes(s.value));
      const ms = asleep.reduce((a, s) => a + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);
      return ms > 0 ? Math.round(ms / 60000) : null;
    } catch {
      return null;
    }
  }

  async getLatestWeightKg(): Promise<number | null> {
    try {
      const sample = await this.hk.getMostRecentQuantitySample(HK_READ.weight);
      return sample?.quantity ?? null;
    } catch {
      return null;
    }
  }
}

function dayBounds(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { start, end };
}

interface HealthKitModule {
  isHealthDataAvailable(): Promise<boolean>;
  requestAuthorization(read: string[], write: string[]): Promise<boolean>;
  queryQuantitySamples(
    identifier: string,
    opts: { from: Date; to: Date },
  ): Promise<{ quantity?: number }[]>;
  queryCategorySamples(
    identifier: string,
    opts: { from: Date; to: Date },
  ): Promise<{ value: number; startDate: string; endDate: string }[]>;
  getMostRecentQuantitySample(identifier: string): Promise<{ quantity?: number } | null>;
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
    const hk = (mod?.default ?? mod) as HealthKitModule;
    if (hk && typeof hk.isHealthDataAvailable === 'function') {
      provider = new HealthKitProvider(hk);
    }
  } catch {
    // No native module in this build. The default provider already says so.
  }
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
