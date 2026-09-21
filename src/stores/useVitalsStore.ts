import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { VITAL_KEYS, type VitalKey, type VitalsDay } from '../domain/vitals';
import { jsonStorage, STORE_KEYS } from './persist';

interface VitalsState {
  days: VitalsDay[];

  /**
   * Store a day's passive signals. Returns true when something was actually
   * written, so a sync can report how much it brought in rather than claiming
   * credit for a day of nulls.
   */
  record: (day: VitalsDay) => boolean;
  /** Hand-enter one signal, for someone without a wearable. */
  setManual: (key: VitalKey, value: number, date?: string) => void;
  removeDay: (date: string) => void;
  /** Throw away sample data without touching anything real. */
  clearDemo: () => void;
  forDate: (date: string) => VitalsDay | null;
  clear: () => void;
}

function hasAnything(day: VitalsDay): boolean {
  return (
    VITAL_KEYS.some((k) => typeof day[k] === 'number' && Number.isFinite(day[k] as number)) ||
    typeof day.activeEnergyKcal === 'number'
  );
}

export const useVitalsStore = create<VitalsState>()(
  persist(
    (set, get) => ({
      days: [],

      record: (day) => {
        if (!hasAnything(day)) return false;
        set((s) => {
          const existing = s.days.find((d) => d.date === day.date);
          // A hand-entered number is the user telling the app something. A
          // later sync filling in the blanks around it must not overwrite it.
          const merged: VitalsDay = existing
            ? {
                ...day,
                ...Object.fromEntries(
                  VITAL_KEYS.filter(
                    (k) => existing.source === 'manual' && typeof existing[k] === 'number',
                  ).map((k) => [k, existing[k]]),
                ),
                source: existing.source === 'manual' ? 'manual' : day.source,
              }
            : day;
          return { days: [merged, ...s.days.filter((d) => d.date !== day.date)] };
        });
        return true;
      },

      setManual: (key, value, date = todayISO()) =>
        set((s) => {
          const existing = s.days.find((d) => d.date === date);
          const next: VitalsDay = { ...(existing ?? { date, source: 'manual' }), [key]: value, source: 'manual' };
          return { days: [next, ...s.days.filter((d) => d.date !== date)] };
        }),

      removeDay: (date) => set((s) => ({ days: s.days.filter((d) => d.date !== date) })),

      clearDemo: () => set((s) => ({ days: s.days.filter((d) => d.source !== 'demo') })),

      forDate: (date) => get().days.find((d) => d.date === date) ?? null,

      clear: () => set({ days: [] }),
    }),
    { name: STORE_KEYS.vitals, storage: jsonStorage() },
  ),
);
