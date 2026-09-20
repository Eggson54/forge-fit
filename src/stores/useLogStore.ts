import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { sumMacros } from '../domain/nutrition';
import type {
  FoodMacros,
  MeasurementLog,
  MealSlot,
  NutritionEntry,
  ProgressPhoto,
  SleepLog,
  StepsLog,
  WaterLog,
  WeightLog,
} from '../domain/types';
import { uid } from '../lib/uid';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';
import { suggestMealName, type SavedMeal, type SavedMealItem } from '../domain/savedMeals';
import type { CardioSession } from '../domain/cardio';

interface LogState {
  nutrition: NutritionEntry[];
  water: WaterLog[];
  weight: WeightLog[];
  sleep: SleepLog[];
  steps: StepsLog[];
  measurements: MeasurementLog[];
  photos: ProgressPhoto[];
  cardio: CardioSession[];

  addFood: (input: {
    slot: MealSlot;
    name: string;
    quantity: number;
    servingLabel: string;
    macros: FoodMacros;
    source: NutritionEntry['source'];
    isEstimate: boolean;
    date?: string;
  }) => void;
  updateFood: (id: string, patch: Partial<NutritionEntry>) => void;
  removeFood: (id: string) => void;

  savedMeals: SavedMeal[];
  saveMeal: (input: { name: string; slot: MealSlot; items: SavedMealItem[] }) => SavedMeal;
  renameMeal: (id: string, name: string) => void;
  removeMeal: (id: string) => void;
  /** Logs every item of a saved meal into the given slot and date. */
  logSavedMeal: (id: string, slot?: MealSlot, date?: string) => number;

  addWater: (amountOz: number, date?: string) => void;
  logWeight: (weightKg: number, date?: string) => void;
  logSleep: (minutes: number, quality?: number, date?: string) => void;
  logSteps: (steps: number, source?: StepsLog['source'], date?: string) => void;
  addMeasurement: (m: Omit<MeasurementLog, 'id' | 'date'> & { date?: string }) => void;
  addPhoto: (p: Omit<ProgressPhoto, 'id'>) => void;
  removePhoto: (id: string) => void;

  logCardio: (input: Omit<CardioSession, 'id' | 'loggedAt' | 'date' | 'source'> & {
    date?: string;
    source?: CardioSession['source'];
  }) => CardioSession;
  removeCardio: (id: string) => void;
  cardioForDate: (date: string) => CardioSession[];

  // Selectors
  nutritionForDate: (date: string) => NutritionEntry[];
  macrosForDate: (date: string) => FoodMacros;
  waterForDate: (date: string) => number;
  stepsForDate: (date: string) => number;
  sleepForDate: (date: string) => number;
  latestWeightKg: () => number | null;
  reset: () => void;
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      nutrition: [],
      savedMeals: [],
      water: [],
      weight: [],
      sleep: [],
      steps: [],
      measurements: [],
      photos: [],
      cardio: [],

      addFood: (input) => {
        const date = input.date ?? todayISO();
        const entry: NutritionEntry = {
          id: uid('n_'),
          date,
          slot: input.slot,
          name: input.name,
          quantity: input.quantity,
          servingLabel: input.servingLabel,
          macros: input.macros,
          source: input.source,
          isEstimate: input.isEstimate,
          loggedAt: new Date().toISOString(),
        };
        set((s) => ({ nutrition: [entry, ...s.nutrition] }));
        analytics.track('meal_logged', { source: input.source });
      },

      updateFood: (id, patch) =>
        set((s) => ({ nutrition: s.nutrition.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),

      removeFood: (id) => set((s) => ({ nutrition: s.nutrition.filter((n) => n.id !== id) })),

      saveMeal: ({ name, slot, items }) => {
        const meal: SavedMeal = {
          id: uid('sm_'),
          name: name.trim() || suggestMealName(items, slot),
          slot,
          // Copied, not referenced: editing tonight's dinner entry must not
          // rewrite the meal you saved last month.
          items: items.map((i) => ({ ...i, macros: { ...i.macros } })),
          createdAt: new Date().toISOString(),
          timesLogged: 0,
          lastLoggedAt: null,
        };
        set((s) => ({ savedMeals: [meal, ...s.savedMeals] }));
        return meal;
      },

      renameMeal: (id, name) =>
        set((s) => ({
          savedMeals: s.savedMeals.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m)),
        })),

      removeMeal: (id) => set((s) => ({ savedMeals: s.savedMeals.filter((m) => m.id !== id) })),

      logSavedMeal: (id, slot, date) => {
        const meal = get().savedMeals.find((m) => m.id === id);
        if (!meal) return 0;
        const when = date ?? todayISO();
        const target = slot ?? meal.slot;
        const now = new Date().toISOString();
        const entries: NutritionEntry[] = meal.items.map((item) => ({
          id: uid('n_'),
          date: when,
          slot: target,
          name: item.name,
          quantity: item.quantity,
          servingLabel: item.servingLabel,
          macros: item.macros,
          source: 'recipe',
          // The items were estimates when they were first logged and saving
          // them did not make them measurements.
          isEstimate: true,
          loggedAt: now,
        }));
        set((s) => ({
          nutrition: [...entries, ...s.nutrition],
          savedMeals: s.savedMeals.map((m) =>
            m.id === id ? { ...m, timesLogged: m.timesLogged + 1, lastLoggedAt: now } : m,
          ),
        }));
        analytics.track('meal_logged', { source: 'saved_meal' });
        return entries.length;
      },

      addWater: (amountOz, date = todayISO()) =>
        set((s) => ({ water: [{ id: uid('w_'), date, amountOz, loggedAt: new Date().toISOString() }, ...s.water] })),

      logWeight: (weightKg, date = todayISO()) =>
        set((s) => ({
          // One weigh-in per day: replace if exists.
          weight: [
            { id: uid('wt_'), date, weightKg, loggedAt: new Date().toISOString() },
            ...s.weight.filter((w) => w.date !== date),
          ].sort((a, b) => (a.date < b.date ? 1 : -1)),
        })),

      logSleep: (minutes, quality, date = todayISO()) =>
        set((s) => ({ sleep: [{ id: uid('sl_'), date, minutes, quality }, ...s.sleep.filter((x) => x.date !== date)] })),

      logSteps: (steps, source = 'manual', date = todayISO()) =>
        set((s) => ({ steps: [{ id: uid('st_'), date, steps, source }, ...s.steps.filter((x) => x.date !== date)] })),

      addMeasurement: (m) =>
        set((s) => ({ measurements: [{ id: uid('m_'), date: m.date ?? todayISO(), ...m }, ...s.measurements] })),

      addPhoto: (p) => set((s) => ({ photos: [{ id: uid('p_'), ...p }, ...s.photos] })),
      removePhoto: (id) => set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),

      logCardio: (input) => {
        // Unlike steps or sleep, several of these a day is normal — a run in
        // the morning and a walk after dinner are two sessions, not a
        // correction of one, so this appends rather than replacing by date.
        const session: CardioSession = {
          id: uid('cd_'),
          date: input.date ?? todayISO(),
          type: input.type,
          minutes: Math.max(0, Math.round(input.minutes)),
          distanceKm: input.distanceKm && input.distanceKm > 0 ? input.distanceKm : undefined,
          calories: input.calories && input.calories > 0 ? Math.round(input.calories) : undefined,
          effort: input.effort,
          notes: input.notes?.trim() || undefined,
          source: input.source ?? 'manual',
          loggedAt: new Date().toISOString(),
        };
        set((s) => ({ cardio: [session, ...s.cardio] }));
        return session;
      },
      removeCardio: (id) => set((s) => ({ cardio: s.cardio.filter((c) => c.id !== id) })),
      cardioForDate: (date) => get().cardio.filter((c) => c.date === date),

      nutritionForDate: (date) => get().nutrition.filter((n) => n.date === date),
      macrosForDate: (date) => sumMacros(get().nutrition.filter((n) => n.date === date)),
      waterForDate: (date) => get().water.filter((w) => w.date === date).reduce((a, w) => a + w.amountOz, 0),
      stepsForDate: (date) => get().steps.find((s) => s.date === date)?.steps ?? 0,
      sleepForDate: (date) => get().sleep.find((s) => s.date === date)?.minutes ?? 0,
      // Pick by date, not insertion order — a backfilled or rehydrated log can
      // leave the newest entry anywhere in the array.
      latestWeightKg: () => {
        const w = get().weight;
        if (w.length === 0) return null;
        return w.reduce((best, x) => (x.date > best.date ? x : best), w[0]!).weightKg;
      },

      reset: () =>
        set({
          nutrition: [], savedMeals: [], water: [], weight: [], sleep: [],
          steps: [], measurements: [], photos: [], cardio: [],
        }),
    }),
    { name: STORE_KEYS.logs, storage: jsonStorage() },
  ),
);
