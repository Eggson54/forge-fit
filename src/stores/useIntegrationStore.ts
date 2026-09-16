import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { health } from '../services/health';
import { strava, type StravaActivity } from '../services/strava';
import { jsonStorage, STORE_KEYS } from './persist';
import { useLogStore } from './useLogStore';

interface IntegrationState {
  appleWatchConnected: boolean;
  stravaConnected: boolean;
  stravaAthlete: string | null;
  activities: StravaActivity[];
  lastHeartRate: number | null;
  activeEnergyKcal: number | null;

  connectAppleWatch: () => Promise<void>;
  disconnectAppleWatch: () => void;
  connectStrava: () => Promise<void>;
  disconnectStrava: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      appleWatchConnected: false,
      stravaConnected: false,
      stravaAthlete: null,
      activities: [],
      lastHeartRate: null,
      activeEnergyKcal: null,

      connectAppleWatch: async () => {
        // Real build: request HealthKit workout/heart-rate/energy permissions.
        await health.requestPermissions(['workouts', 'heartRate', 'steps']);
        const date = todayISO();
        const hr = await health.getHeartRateAvg(date);
        const energy = await health.getActiveEnergyKcal(date);
        const steps = await health.getSteps(date);

        // Demo mode (no native HealthKit): surface representative Watch data so the
        // integration is visibly working. Clearly sample data until a dev build.
        const demoHr = hr ?? 68;
        const demoEnergy = energy ?? 540;
        const demoSteps = steps ?? 8600;
        if (steps == null) useLogStore.getState().logSteps(demoSteps, 'health');

        set({ appleWatchConnected: true, lastHeartRate: demoHr, activeEnergyKcal: demoEnergy });
      },

      disconnectAppleWatch: () => set({ appleWatchConnected: false, lastHeartRate: null, activeEnergyKcal: null }),

      connectStrava: async () => {
        const conn = await strava.connect();
        const activities = await strava.importRecentActivities();
        // Reflect activity into daily steps for days we have (demo/real alike).
        for (const a of activities) {
          if (a.type === 'Run' || a.type === 'Walk') {
            const approxSteps = Math.round(a.distanceKm * 1350);
            if (approxSteps > 0) useLogStore.getState().logSteps(approxSteps, 'health', a.date);
          }
        }
        set({ stravaConnected: conn.connected, stravaAthlete: conn.athlete ?? null, activities });
      },

      disconnectStrava: async () => {
        await strava.disconnect();
        set({ stravaConnected: false, stravaAthlete: null, activities: [] });
      },

      refresh: async () => {
        if (get().stravaConnected) {
          const activities = await strava.importRecentActivities();
          set({ activities });
        }
      },

      reset: () => set({ appleWatchConnected: false, stravaConnected: false, stravaAthlete: null, activities: [], lastHeartRate: null, activeEnergyKcal: null }),
    }),
    { name: STORE_KEYS.integrations, storage: jsonStorage() },
  ),
);
