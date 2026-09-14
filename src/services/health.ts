import { Platform } from 'react-native';

/**
 * Apple Health / Health Connect abstraction.
 *
 * A native HealthKit bridge requires a custom dev build + a library such as
 * `@kingstinct/react-native-healthkit`. To keep the app runnable everywhere
 * (and functional WITHOUT Health), this module exposes a stable interface with
 * a graceful default implementation. Wire the native module in `ensureNative()`
 * for a production build.
 *
 * Permissions are requested INDIVIDUALLY per metric; we never request more than
 * a feature needs.
 */
export type HealthMetric = 'steps' | 'weight' | 'workouts' | 'sleep' | 'heartRate';

export interface HealthProvider {
  isAvailable(): Promise<boolean>;
  requestPermissions(metrics: HealthMetric[]): Promise<Record<HealthMetric, boolean>>;
  getSteps(date: string): Promise<number | null>;
  getLatestWeightKg(): Promise<number | null>;
  getSleepMinutes(date: string): Promise<number | null>;
  /** Apple Watch metrics. */
  getHeartRateAvg(date: string): Promise<number | null>;
  getActiveEnergyKcal(date: string): Promise<number | null>;
}

class UnavailableHealthProvider implements HealthProvider {
  async isAvailable() {
    return false;
  }
  async requestPermissions(metrics: HealthMetric[]) {
    return Object.fromEntries(metrics.map((m) => [m, false])) as Record<HealthMetric, boolean>;
  }
  async getSteps() {
    return null;
  }
  async getLatestWeightKg() {
    return null;
  }
  async getSleepMinutes() {
    return null;
  }
  async getHeartRateAvg() {
    return null;
  }
  async getActiveEnergyKcal() {
    return null;
  }
}

let provider: HealthProvider = new UnavailableHealthProvider();

/** Called at startup; swaps in the native provider when a dev build supports it. */
export function ensureNative(): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  // In a production dev-build:
  //   provider = new HealthKitProvider();  // iOS
  //   provider = new HealthConnectProvider(); // Android
  // Left as the safe default here so the app runs in Expo Go and on web.
}

export const health = {
  provider: () => provider,
  isAvailable: () => provider.isAvailable(),
  requestPermissions: (m: HealthMetric[]) => provider.requestPermissions(m),
  getSteps: (date: string) => provider.getSteps(date),
  getLatestWeightKg: () => provider.getLatestWeightKg(),
  getSleepMinutes: (date: string) => provider.getSleepMinutes(date),
  getHeartRateAvg: (date: string) => provider.getHeartRateAvg(date),
  getActiveEnergyKcal: (date: string) => provider.getActiveEnergyKcal(date),
};
