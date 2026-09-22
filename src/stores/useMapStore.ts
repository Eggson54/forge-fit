import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import type { LatLon } from '../domain/geo';
import { DEFAULT_RADIUS_M, type PrivacyZone } from '../domain/privacy';
import { DEFAULT_SOURCE } from '../domain/tiles';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Map preferences and privacy zones.
 *
 * Kept apart from the activity store on purpose. Zones are a *setting* that
 * applies to every route ever recorded and every route recorded later; if
 * they lived alongside the activities, adding one would mean rewriting the
 * whole history, and removing one could not put back what had been thrown
 * away. Applying them at the point of drawing keeps the recording honest and
 * the zone reversible.
 */

interface MapState {
  zones: PrivacyZone[];
  sourceId: string;
  /** Off by default: drawing every route on one map is a lot of work on an old phone. */
  heatmapEnabled: boolean;

  addZone: (center: LatLon, label: string, radiusM?: number) => PrivacyZone;
  updateZone: (id: string, patch: Partial<Omit<PrivacyZone, 'id'>>) => void;
  removeZone: (id: string) => void;
  setSource: (id: string) => void;
  setHeatmapEnabled: (on: boolean) => void;
  reset: () => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      zones: [],
      sourceId: DEFAULT_SOURCE.id,
      heatmapEnabled: true,

      addZone: (center, label, radiusM = DEFAULT_RADIUS_M) => {
        const zone: PrivacyZone = { id: uid('pz_'), label: label.trim() || 'Private', center, radiusM };
        set((s) => ({ zones: [...s.zones, zone] }));
        return zone;
      },

      updateZone: (id, patch) =>
        set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),

      removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
      setSource: (sourceId) => set({ sourceId }),
      setHeatmapEnabled: (heatmapEnabled) => set({ heatmapEnabled }),

      reset: () => set({ zones: [], sourceId: DEFAULT_SOURCE.id, heatmapEnabled: true }),
    }),
    { name: STORE_KEYS.map, storage: jsonStorage() },
  ),
);
