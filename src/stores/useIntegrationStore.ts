import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { lastNDays, todayISO } from '../domain/date';
import { cardioTypeFromLabel } from '../domain/cardio';
import {
  EMPTY_SYNC,
  capabilityFor,
  syncDue,
  type ProviderId,
  type ProviderStatus,
  type SyncOutcome,
} from '../domain/integrations';
import { demoVitals } from '../domain/vitals';
import { health, type DailyHealth, type HealthMetric } from '../services/health';
import { StravaError, strava, type StravaActivity } from '../services/strava';
import { watch, type WatchStatus } from '../services/watch';
import { jsonStorage, STORE_KEYS } from './persist';
import { useLogStore } from './useLogStore';
import { useVitalsStore } from './useVitalsStore';

/** Everything Apple Health is asked for, and nothing it is not. */
const HEALTH_METRICS: HealthMetric[] = [
  'steps',
  'weight',
  'sleep',
  'activeEnergy',
  'restingHeartRate',
  'hrv',
  'respiratoryRate',
  'bodyTemperature',
  'oxygenSaturation',
];

interface IntegrationState {
  providers: Record<ProviderId, ProviderStatus>;
  activities: StravaActivity[];
  watchStatus: WatchStatus | null;
  /** The last sync's result, for the line under the button. */
  lastOutcome: SyncOutcome | null;
  busy: ProviderId | null;

  connect: (id: ProviderId) => Promise<void>;
  disconnect: (id: ProviderId) => Promise<void>;
  sync: (id: ProviderId) => Promise<SyncOutcome>;
  syncAll: (opts?: { onlyIfDue?: boolean }) => Promise<void>;
  capability: (id: ProviderId) => { supported: boolean; reason: string | null };
  /**
   * Fill the app with sample data so the screens can be seen where no real
   * device can be read. Enters the `demo` state, which never reads as
   * connected and is labelled on every screen that shows it.
   */
  previewWithSampleData: (id: ProviderId) => void;
  reset: () => void;
}

const BLANK: Record<ProviderId, ProviderStatus> = {
  apple_health: { id: 'apple_health', state: 'disconnected' },
  apple_watch: { id: 'apple_watch', state: 'disconnected' },
  strava: { id: 'strava', state: 'disconnected' },
};

/**
 * Fold imported activities into the logs they belong in.
 *
 * They used to live only in this store, which meant a Strava run appeared on
 * the integrations screen and nowhere else — not in the conditioning history,
 * not in the export. Imports are keyed by their Strava id so a refresh does not
 * duplicate a run that is already there.
 */
function absorbActivities(activities: StravaActivity[]): SyncOutcome {
  if (activities.length === 0) return { ...EMPTY_SYNC };
  const logs = useLogStore.getState();

  const imported = logs.importCardio(
    activities.map((a) => ({
      date: a.date,
      type: cardioTypeFromLabel(a.type),
      minutes: Math.max(0, Math.round(a.movingMinutes)),
      distanceKm: a.distanceKm > 0 ? a.distanceKm : undefined,
      calories: a.calories > 0 ? a.calories : undefined,
      source: 'strava' as const,
      externalId: `strava:${a.id}`,
    })),
  );

  return { imported, skipped: activities.length - imported, errors: [] };
}

/** Fold a day of Health into the logs and the vitals store. */
function absorbHealthDay(day: DailyHealth): number {
  const logs = useLogStore.getState();
  let wrote = 0;

  if (day.steps != null && day.steps > 0) {
    logs.logSteps(day.steps, 'health', day.date);
    wrote += 1;
  }
  if (day.sleepMinutes != null && day.sleepMinutes > 0) {
    logs.logSleep(day.sleepMinutes, undefined, day.date);
    wrote += 1;
  }

  const vitals = useVitalsStore.getState();
  const recorded = vitals.record({
    date: day.date,
    restingHeartRate: day.restingHeartRate,
    hrvMs: day.hrvMs,
    respiratoryRate: day.respiratoryRate,
    wristTemperatureC: day.wristTemperatureC,
    oxygenSaturationPct: day.oxygenSaturationPct,
    activeEnergyKcal: day.activeEnergyKcal,
    source: 'health',
  });
  return wrote + (recorded ? 1 : 0);
}

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      providers: BLANK,
      activities: [],
      watchStatus: null,
      lastOutcome: null,
      busy: null,

      capability: (id) =>
        capabilityFor(id, {
          platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
          hasNativeModule: health.hasNativeModule,
          backendConfigured: strava.configured,
        }),

      connect: async (id) => {
        const cap = get().capability(id);
        const put = (patch: Partial<ProviderStatus>) =>
          set((s) => ({ providers: { ...s.providers, [id]: { ...s.providers[id], id, ...patch } } }));

        // A provider that cannot work here never shows as connected, whatever
        // the user taps. The screen offers the reason instead of a retry.
        if (!cap.supported) {
          put({ state: 'unavailable', error: cap.reason });
          return;
        }

        set({ busy: id });
        put({ state: 'connecting', error: null });
        try {
          if (id === 'strava') {
            const tokens = await strava.connect();
            put({ state: 'connected', account: tokens.athlete, error: null });
            await get().sync('strava');
          } else if (id === 'apple_health') {
            const granted = await health.requestPermissions(HEALTH_METRICS);
            const asked = Object.keys(granted).filter((k) => granted[k]);
            put({ state: 'connected', grantedScopes: asked, error: null });
            await get().sync('apple_health');
          } else {
            const status = await watch.detect(lastNDays(4));
            set({ watchStatus: status });
            put(
              status.detected
                ? { state: 'connected', account: null, error: null }
                : { state: 'unavailable', error: status.reason },
            );
          }
        } catch (e) {
          const err = e as Error;
          put({ state: 'error', error: err.message });
        } finally {
          set({ busy: null });
        }
      },

      disconnect: async (id) => {
        if (id === 'strava') await strava.disconnect();
        // Clearing a demo throws away the sample data with it; clearing a real
        // connection leaves every reading the device actually gave.
        if (get().providers[id].state === 'demo') useVitalsStore.getState().clearDemo();
        set((s) => ({
          providers: { ...s.providers, [id]: { id, state: 'disconnected' } },
          ...(id === 'strava' ? { activities: [] } : null),
          ...(id === 'apple_watch' ? { watchStatus: null } : null),
        }));
      },

      sync: async (id) => {
        const status = get().providers[id];
        if (status.state !== 'connected') return { ...EMPTY_SYNC };

        const put = (patch: Partial<ProviderStatus>) =>
          set((s) => ({ providers: { ...s.providers, [id]: { ...s.providers[id], id, ...patch } } }));

        set({ busy: id });
        try {
          let outcome: SyncOutcome = { ...EMPTY_SYNC };

          if (id === 'strava') {
            const activities = await strava.fetchActivities();
            outcome = absorbActivities(activities);
            set((s) => ({ activities: [...activities, ...s.activities].slice(0, 50) }));
          } else if (id === 'apple_health') {
            let wrote = 0;
            // A week back, not just today: a phone that was off, or an app
            // that was not opened, leaves holes that never fill otherwise.
            for (const date of lastNDays(7)) {
              wrote += absorbHealthDay(await health.readDay(date));
            }
            outcome = { imported: wrote, skipped: 0, errors: [] };
          } else if (id === 'apple_watch') {
            const detected = await watch.detect(lastNDays(4));
            set({ watchStatus: detected });
            if (!detected.detected) put({ state: 'unavailable', error: detected.reason });
          }

          put({ lastSyncedAt: new Date().toISOString(), error: null });
          set({ lastOutcome: outcome });
          return outcome;
        } catch (e) {
          const err = e as Error;
          // Only a genuine sign-out drops the connection. A rate limit or a
          // dropped network is not a reason to make someone reconnect.
          if (e instanceof StravaError && e.disconnects) {
            put({ state: 'disconnected', error: err.message });
          } else {
            put({ error: err.message });
          }
          const outcome: SyncOutcome = { imported: 0, skipped: 0, errors: [err.message] };
          set({ lastOutcome: outcome });
          return outcome;
        } finally {
          set({ busy: null });
        }
      },

      syncAll: async ({ onlyIfDue = true } = {}) => {
        for (const id of ['apple_health', 'strava', 'apple_watch'] as ProviderId[]) {
          const status = get().providers[id];
          if (status.state !== 'connected') continue;
          if (onlyIfDue && !syncDue(status.lastSyncedAt)) continue;
          await get().sync(id);
        }
      },

      previewWithSampleData: (id) => {
        const put = (patch: Partial<ProviderStatus>) =>
          set((s) => ({ providers: { ...s.providers, [id]: { ...s.providers[id], id, ...patch } } }));

        if (id === 'strava') {
          const activities = strava.demoActivities();
          absorbActivities(activities);
          set((s) => ({ activities: [...activities, ...s.activities].slice(0, 50) }));
        } else {
          const today = todayISO();
          const vitals = useVitalsStore.getState();
          for (const day of demoVitals(today)) vitals.record(day);
          if (id === 'apple_watch') {
            set({
              watchStatus: {
                detected: true,
                lastSeenDate: today,
                signals: ['heart rate variability', 'resting heart rate', 'wrist temperature'],
                devices: ['apple_watch'],
                companionInstalled: false,
                reason: null,
              },
            });
          }
        }
        put({ state: 'demo', account: null, lastSyncedAt: new Date().toISOString(), error: null });
      },

      reset: () => set({ providers: BLANK, activities: [], watchStatus: null, lastOutcome: null, busy: null }),
    }),
    {
      name: STORE_KEYS.integrations,
      storage: jsonStorage(),
      // `busy` is a transient flag. Persisting it left the screen showing a
      // spinner forever after a crash mid-connect.
      partialize: (s) => ({ providers: s.providers, activities: s.activities, watchStatus: s.watchStatus }),
      version: 2,
      migrate: (persisted) => {
        const old = persisted as Record<string, unknown> | null;
        if (!old || !('providers' in (old ?? {}))) {
          // The v1 shape was two booleans. Rather than guess at a token that
          // may no longer be valid, everything starts disconnected and the
          // user reconnects once.
          return { providers: BLANK, activities: [], watchStatus: null };
        }
        return old;
      },
    },
  ),
);

/** Kick a background sync when the app opens, without blocking the UI. */
export function syncIntegrationsInBackground(): void {
  void useIntegrationStore.getState().syncAll({ onlyIfDue: true });
}

export { todayISO };
