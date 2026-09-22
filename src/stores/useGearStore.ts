import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import { todayISO } from '../domain/date';
import { DEFAULT_LIFE_KM, defaultFor, orderGear, type Gear, type GearKind, type GearUse } from '../domain/gear';
import type { Goal, GoalMetric, GoalPeriod } from '../domain/goals';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Gear and goals.
 *
 * Together because they are the same kind of thing — a small set of
 * user-declared intentions that activities are measured against — and
 * because neither justifies a store of its own.
 *
 * Gear *use* is stored separately from the activity rather than only on it.
 * An activity can be deleted, and a pair of shoes should not lose its
 * mileage because a duplicate recording was tidied up... except that it
 * should, which is why `forgetActivity` exists and is called. The separation
 * is so mileage can be recomputed from one place rather than by walking every
 * activity every time a gear screen opens.
 */

interface GearState {
  gear: Gear[];
  uses: GearUse[];
  goals: Goal[];

  addGear: (input: { kind: GearKind; name: string; types: string[]; startingM?: number; retireAtM?: number | null }) => Gear;
  updateGear: (id: string, patch: Partial<Omit<Gear, 'id'>>) => void;
  retireGear: (id: string, retired: boolean) => void;
  removeGear: (id: string) => void;

  /** Attribute an activity's distance to a piece of gear. Idempotent per activity. */
  logUse: (gearId: string, activityId: string, date: string, distanceM: number) => void;
  forgetActivity: (activityId: string) => void;
  suggestGearFor: (type: string) => Gear | null;

  addGoal: (input: { period: GoalPeriod; metric: GoalMetric; target: number; types?: string[] }) => Goal;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id'>>) => void;
  removeGoal: (id: string) => void;

  ordered: () => ReturnType<typeof orderGear>;
  reset: () => void;
}

export const useGearStore = create<GearState>()(
  persist(
    (set, get) => ({
      gear: [],
      uses: [],
      goals: [],

      addGear: ({ kind, name, types, startingM = 0, retireAtM }) => {
        const life = DEFAULT_LIFE_KM[kind];
        const item: Gear = {
          id: uid('gear_'),
          kind,
          name: name.trim() || `New ${kind}`,
          types,
          addedOn: todayISO(),
          startingM: Math.max(0, startingM),
          retireAtM: retireAtM !== undefined ? retireAtM : life != null ? life * 1000 : null,
          // The first of a kind becomes the default, so somebody with one pair
          // of shoes never has to think about this screen again.
          isDefault: !get().gear.some((g) => g.kind === kind && !g.retiredOn),
        };
        set((s) => ({ gear: [...s.gear, item] }));
        return item;
      },

      updateGear: (id, patch) =>
        set((s) => ({
          gear: s.gear.map((g) => {
            if (g.id !== id) return g;
            return { ...g, ...patch };
          }),
        })),

      retireGear: (id, retired) =>
        set((s) => ({
          gear: s.gear.map((g) => (g.id === id ? { ...g, retiredOn: retired ? todayISO() : null } : g)),
        })),

      removeGear: (id) =>
        set((s) => ({ gear: s.gear.filter((g) => g.id !== id), uses: s.uses.filter((u) => u.gearId !== id) })),

      logUse: (gearId, activityId, date, distanceM) =>
        set((s) => ({
          // One row per activity, whatever gear it was on: re-attributing an
          // activity must move its distance rather than count it twice.
          uses: [...s.uses.filter((u) => u.activityId !== activityId), { gearId, activityId, date, distanceM }],
        })),

      forgetActivity: (activityId) =>
        set((s) => ({ uses: s.uses.filter((u) => u.activityId !== activityId) })),

      suggestGearFor: (type) => defaultFor(type, get().gear),

      addGoal: ({ period, metric, target, types = [] }) => {
        const goal: Goal = { id: uid('goal_'), period, metric, target, types, enabled: true };
        set((s) => ({ goals: [...s.goals, goal] }));
        return goal;
      },

      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      ordered: () => orderGear(get().gear, get().uses),

      reset: () => set({ gear: [], uses: [], goals: [] }),
    }),
    { name: STORE_KEYS.gear, storage: jsonStorage() },
  ),
);
