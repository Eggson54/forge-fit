import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLon } from '../domain/geo';
import {
  evaluateCheckIn,
  summariseCollection,
  type Claim,
  type CollectionSummary,
  type Gym,
} from '../domain/gyms';
import { searchGyms, type MapFeature } from '../services/gyms';
import type { GymKit } from '../domain/gymKit';
import { location, type LocationFix, type LocationStatus } from '../services/location';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Search radii that read as round numbers in the unit the user actually has
 * set. A metric list shown in miles becomes "0.9 / 3.1 / 9.3 mi", which looks
 * like the app converted something it should have chosen properly.
 */
export const SEARCH_RADII_METRIC = [1000, 5000, 15000] as const;
export const SEARCH_RADII_IMPERIAL = [1609, 8047, 24140] as const; // 1, 5, 15 miles

export function searchRadiiFor(units: 'imperial' | 'metric'): readonly number[] {
  return units === 'imperial' ? SEARCH_RADII_IMPERIAL : SEARCH_RADII_METRIC;
}

export type SearchRadius = number;

interface GymState {
  /** Opt-in, off until the user turns the map on. Persisted. */
  locationEnabled: boolean;
  permission: LocationStatus;
  fix: LocationFix | null;

  /** Last search results — cached so reopening the tab is not a cold load. */
  gyms: Gym[];
  features: MapFeature[];
  attribution: string;
  sampleData: boolean;
  radius: SearchRadius;
  loading: boolean;
  lastSearchAt: string | null;

  claims: Claim[];
  /** Per-gym equipment, keyed by gym id. Absent means "standard". */
  kits: Record<string, GymKit>;

  gymsById: () => Record<string, Gym>;
  claimedIds: () => Set<string>;
  kitFor: (gymId: string | null | undefined) => GymKit | undefined;
  setKit: (gymId: string, kit: GymKit) => void;
  clearKit: (gymId: string) => void;
  claimFor: (gymId: string) => Claim | undefined;
  summary: () => CollectionSummary;
  /** Total collection points, for the profile and rank surfaces. */
  points: () => number;

  enableLocation: () => Promise<LocationStatus>;
  disableLocation: () => void;
  refreshFix: () => Promise<LocationFix | null>;
  setRadius: (r: SearchRadius) => Promise<void>;
  search: (center?: LatLon) => Promise<void>;
  /** Returns the points earned, or null when the check-in was refused. */
  checkIn: (gymId: string) => { points: number; first: boolean } | null;
  reset: () => void;
}

export const useGymStore = create<GymState>()(
  persist(
    (set, get) => ({
      locationEnabled: false,
      permission: 'unknown',
      fix: null,

      gyms: [],
      features: [],
      attribution: '',
      sampleData: false,
      radius: 5000,
      loading: false,
      lastSearchAt: null,

      claims: [],
      kits: {},

      gymsById: () => {
        const out: Record<string, Gym> = {};
        for (const g of get().gyms) out[g.id] = g;
        // A claimed gym that has dropped out of the current search radius must
        // still resolve, or the collection summary silently loses it.
        for (const c of get().claims) if (!out[c.gymId] && c.gym) out[c.gymId] = c.gym;
        return out;
      },

      claimedIds: () => new Set(get().claims.map((c) => c.gymId)),

      kitFor: (gymId) => (gymId ? get().kits[gymId] : undefined),

      setKit: (gymId, kit) =>
        set((s) => ({
          kits: {
            ...s.kits,
            [gymId]: {
              ...kit,
              plates: [...new Set(kit.plates.filter((p) => p > 0))].sort((a, b) => b - a),
              bars: [...new Set(kit.bars.filter((b) => b >= 0))].sort((a, b) => b - a),
            },
          },
        })),

      clearKit: (gymId) =>
        set((s) => {
          const next = { ...s.kits };
          delete next[gymId];
          return { kits: next };
        }),
      claimFor: (gymId) => get().claims.find((c) => c.gymId === gymId),
      summary: () => summariseCollection(get().claims, get().gymsById()),
      points: () => get().claims.reduce((a, c) => a + c.pointsEarned, 0),

      enableLocation: async () => {
        // The request hands back the position it already obtained, so this does
        // not turn one user action into two location reads.
        const { status, fix } = await location.request();
        set({ permission: status, locationEnabled: status === 'granted', fix: fix ?? null });
        if (status !== 'granted') return status;
        analytics.track('gym_map_location_enabled');
        if (fix) await get().search(fix);
        return status;
      },

      // Turning it off clears the cached position immediately. Keeping a
      // "last known" around after someone revokes access is exactly the
      // behaviour that makes people distrust an app.
      disableLocation: () => set({ locationEnabled: false, fix: null }),

      refreshFix: async () => {
        if (!get().locationEnabled) return null;
        const fix = await location.current();
        if (fix) set({ fix });
        return fix;
      },

      setRadius: async (radius) => {
        set({ radius });
        await get().search();
      },

      search: async (center) => {
        const from = center ?? get().fix;
        if (!from) return;
        set({ loading: true });
        const result = await searchGyms(from, get().radius);
        set({
          gyms: result.gyms,
          features: result.features,
          attribution: result.attribution,
          sampleData: result.sample,
          loading: false,
          lastSearchAt: new Date().toISOString(),
        });
      },

      checkIn: (gymId) => {
        const gym = get().gymsById()[gymId];
        if (!gym) return null;
        const existing = get().claimFor(gymId);
        const verdict = evaluateCheckIn(gym, get().fix, existing, new Date());
        if (!verdict.ok) return null;

        const now = new Date().toISOString();
        if (existing) {
          set((s) => ({
            claims: s.claims.map((c) =>
              c.gymId === gymId
                ? { ...c, visits: [now, ...c.visits].slice(0, 100), pointsEarned: c.pointsEarned + verdict.points }
                : c,
            ),
          }));
        } else {
          set((s) => ({
            claims: [
              // The gym is stored alongside the claim so the collection survives
              // the venue dropping out of a later search.
              { gymId, claimedAt: now, visits: [now], pointsEarned: verdict.points, gym },
              ...s.claims,
            ],
          }));
        }
        analytics.track('gym_claimed', { first: verdict.first, points: verdict.points });
        return { points: verdict.points, first: verdict.first };
      },

      reset: () =>
        set({
          locationEnabled: false,
          permission: 'unknown',
          fix: null,
          gyms: [],
          features: [],
          attribution: '',
          sampleData: false,
          radius: 5000,
          loading: false,
          lastSearchAt: null,
          claims: [],
          kits: {},
        }),
    }),
    {
      name: STORE_KEYS.gyms,
      storage: jsonStorage(),
      // The live position and the in-flight request are scratch state: a
      // position restored from disk is a position that may be days old.
      partialize: (s) => ({
        locationEnabled: s.locationEnabled,
        claims: s.claims,
        kits: s.kits,
        radius: s.radius,
        gyms: s.gyms,
        attribution: s.attribution,
        sampleData: s.sampleData,
      }),
    },
  ),
);
