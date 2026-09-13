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

interface LogState {
  nutrition: NutritionEntry[];
  water: WaterLog[];
  weight: WeightLog[];
  sleep: SleepLog[];
  steps: StepsLog[];
  measurements: MeasurementLog[];
  photos: ProgressPhoto[];

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

  addWater: (amountOz: number, date?: string) => void;
  logWeight: (weightKg: number, date?: string) => void;
  logSleep: (minutes: number, quality?: number, date?: string) => void;
  logSteps: (steps: number, source?: StepsLog['source'], date?: string) => void;
  addMeasurement: (m: Omit<MeasurementLog, 'id' | 'date'> & { date?: string }) => void;
  addPhoto: (p: Omit<ProgressPhoto, 'id'>) => void;
  removePhoto: (id: string) => void;

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
      water: [],
      weight: [],
      sleep: [],
      steps: [],
      measurements: [],
      photos: [],

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

      nutritionForDate: (date) => get().nutrition.filter((n) => n.date === date),
      macrosForDate: (date) => sumMacros(get().nutrition.filter((n) => n.date === date)),
      waterForDate: (date) => get().water.filter((w) => w.date === date).reduce((a, w) => a + w.amountOz, 0),
      stepsForDate: (date) => get().steps.find((s) => s.date === date)?.steps ?? 0,
      sleepForDate: (date) => get().sleep.find((s) => s.date === date)?.minutes ?? 0,
      latestWeightKg: () => get().weight[0]?.weightKg ?? null,

      reset: () => set({ nutrition: [], water: [], weight: [], sleep: [], steps: [], measurements: [], photos: [] }),
    }),
    { name: STORE_KEYS.logs, storage: jsonStorage() },
  ),
);
