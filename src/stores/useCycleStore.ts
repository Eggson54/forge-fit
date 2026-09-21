import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import type { CycleDay, CycleSymptom, Flow } from '../domain/cycle';
import { jsonStorage, STORE_KEYS } from './persist';

interface CycleState {
  /**
   * Off by default, and never turned on by inference.
   *
   * Guessing that someone wants cycle tracking from their profile would be
   * both presumptuous and often wrong. It appears when they ask for it.
   */
  enabled: boolean;
  days: CycleDay[];

  setEnabled: (on: boolean) => void;
  setFlow: (flow: Flow | null, date?: string) => void;
  toggleSymptom: (symptom: CycleSymptom, date?: string) => void;
  setNote: (note: string, date?: string) => void;
  forDate: (date: string) => CycleDay | null;
  clear: () => void;
}

/** Drop a day that has nothing left on it, so it stops counting as logged. */
function compact(days: CycleDay[]): CycleDay[] {
  return days.filter((d) => d.flow || (d.symptoms?.length ?? 0) > 0 || d.note);
}

export const useCycleStore = create<CycleState>()(
  persist(
    (set, get) => ({
      enabled: false,
      days: [],

      setEnabled: (on) => set({ enabled: on }),

      setFlow: (flow, date = todayISO()) =>
        set((s) => {
          const existing = s.days.find((d) => d.date === date);
          const next: CycleDay = existing
            ? { ...existing, ...(flow ? { flow } : {}) }
            : { date, ...(flow ? { flow } : {}) };
          if (!flow && existing) delete (next as { flow?: Flow }).flow;
          return { days: compact([next, ...s.days.filter((d) => d.date !== date)]) };
        }),

      toggleSymptom: (symptom, date = todayISO()) =>
        set((s) => {
          const existing = s.days.find((d) => d.date === date);
          const current = existing?.symptoms ?? [];
          const symptoms = current.includes(symptom)
            ? current.filter((x) => x !== symptom)
            : [...current, symptom];
          const next: CycleDay = { ...(existing ?? { date }), date, symptoms };
          return { days: compact([next, ...s.days.filter((d) => d.date !== date)]) };
        }),

      setNote: (note, date = todayISO()) =>
        set((s) => {
          const existing = s.days.find((d) => d.date === date);
          const trimmed = note.trim();
          const next: CycleDay = { ...(existing ?? { date }), date, note: trimmed || undefined };
          return { days: compact([next, ...s.days.filter((d) => d.date !== date)]) };
        }),

      forDate: (date) => get().days.find((d) => d.date === date) ?? null,

      clear: () => set({ days: [] }),
    }),
    { name: STORE_KEYS.cycle, storage: jsonStorage() },
  ),
);
