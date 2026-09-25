import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import type { LatLon } from '../domain/geo';
import { EMPTY_PLAN, planFrom, type RoutePlan, type SavedRoute } from '../domain/routePlan';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Routes you planned before you ran them.
 *
 * The plan being edited is deliberately *not* persisted — only saved routes
 * are. Half a plan restored after a crash is worse than an empty canvas: you
 * cannot tell which taps survived, so you end up clearing it anyway.
 */

interface RouteState {
  saved: SavedRoute[];
  save: (name: string, plan: RoutePlan) => SavedRoute | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
      saved: [],

      save: (name, plan) => {
        // Two points is the least that is a route. One is a pin.
        if (plan.waypoints.length < 2) return null;
        const route: SavedRoute = {
          id: uid('rt_'),
          name: name.trim() || 'Untitled route',
          waypoints: plan.waypoints,
          distanceM: plan.distanceM,
          closed: plan.closed,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ saved: [route, ...s.saved] }));
        return route;
      },

      rename: (id, name) =>
        set((s) => ({
          saved: s.saved.map((r) => (r.id === id ? { ...r, name: name.trim() || r.name } : r)),
        })),

      remove: (id) => set((s) => ({ saved: s.saved.filter((r) => r.id !== id) })),
      reset: () => set({ saved: [] }),
    }),
    { name: STORE_KEYS.routes, storage: jsonStorage() },
  ),
);

/** Reopen a saved route for editing. Recomputed rather than trusted: a route
 *  saved by an older build may carry a distance from a different formula. */
export function planOf(route: SavedRoute): RoutePlan {
  return planFrom(route.waypoints);
}

export function emptyPlan(): RoutePlan {
  return EMPTY_PLAN;
}

export type { LatLon };
