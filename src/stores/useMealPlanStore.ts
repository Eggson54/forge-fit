import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MealSlot } from '../domain/types';
import { plannedFromMeal, type PlannedMeal } from '../domain/mealPlan';
import type { SavedMeal } from '../domain/savedMeals';
import { jsonStorage, STORE_KEYS } from './persist';

interface MealPlanState {
  plan: PlannedMeal[];
  /** Grocery lines ticked off, keyed by name and serving label. */
  checked: string[];

  add: (meal: SavedMeal, date: string, slot: MealSlot, servings?: number) => PlannedMeal;
  addFreehand: (input: Omit<PlannedMeal, 'id'>) => PlannedMeal;
  setServings: (id: string, servings: number) => void;
  remove: (id: string) => void;
  clearDay: (date: string) => void;
  toggleChecked: (key: string) => void;
  clearChecked: () => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `pm_${Date.now().toString(36)}_${(counter += 1)}`;

export const useMealPlanStore = create<MealPlanState>()(
  persist(
    (set) => ({
      plan: [],
      checked: [],

      add: (meal, date, slot, servings = 1) => {
        const entry = plannedFromMeal(meal, date, slot, servings, nextId());
        set((s) => ({ plan: [...s.plan, entry] }));
        return entry;
      },

      addFreehand: (input) => {
        const entry: PlannedMeal = { ...input, id: nextId() };
        set((s) => ({ plan: [...s.plan, entry] }));
        return entry;
      },

      setServings: (id, servings) =>
        set((s) => ({
          plan: s.plan.map((m) => (m.id === id ? { ...m, servings: Math.max(0.5, servings) } : m)),
        })),

      remove: (id) => set((s) => ({ plan: s.plan.filter((m) => m.id !== id) })),
      clearDay: (date) => set((s) => ({ plan: s.plan.filter((m) => m.date !== date) })),

      toggleChecked: (key) =>
        set((s) => ({
          checked: s.checked.includes(key) ? s.checked.filter((k) => k !== key) : [...s.checked, key],
        })),

      // Ticks are about one shopping trip, so they clear with the trip rather
      // than lingering to confuse the next one.
      clearChecked: () => set({ checked: [] }),
      clear: () => set({ plan: [], checked: [] }),
    }),
    { name: STORE_KEYS.mealPlan, storage: jsonStorage() },
  ),
);
