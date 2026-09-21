import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { BUILT_IN_FACTORS, type FactorDef, type JournalEntry } from '../domain/journal';
import { jsonStorage, STORE_KEYS } from './persist';

interface JournalState {
  entries: JournalEntry[];
  /** Factors the athlete added themselves. */
  customFactors: FactorDef[];
  /** Which factors the journal actually asks about, by key. */
  enabledKeys: string[];

  set: (key: string, value: number, date?: string) => void;
  clearValue: (key: string, date?: string) => void;
  setNote: (note: string, date?: string) => void;
  forDate: (date: string) => JournalEntry | null;
  addCustomFactor: (factor: Omit<FactorDef, 'builtIn'>) => void;
  removeCustomFactor: (key: string) => void;
  toggleFactor: (key: string) => void;
  factors: () => FactorDef[];
  clear: () => void;
}

/** Enough to be useful on day one without being a chore. */
const DEFAULT_ENABLED = ['alcohol', 'stress', 'mood', 'soreness'];

export const useJournalStore = create<JournalState>()(
  persist(
    (setState, get) => ({
      entries: [],
      customFactors: [],
      enabledKeys: DEFAULT_ENABLED,

      set: (key, value, date = todayISO()) =>
        setState((s) => {
          const existing = s.entries.find((e) => e.date === date);
          const next: JournalEntry = existing
            ? { ...existing, values: { ...existing.values, [key]: value } }
            : { date, values: { [key]: value } };
          return { entries: [next, ...s.entries.filter((e) => e.date !== date)] };
        }),

      clearValue: (key, date = todayISO()) =>
        setState((s) => {
          const existing = s.entries.find((e) => e.date === date);
          if (!existing) return s;
          const { [key]: _removed, ...rest } = existing.values;
          // An entry with nothing left in it is not a day logged, and leaving
          // it behind would inflate the streak.
          const emptied = Object.keys(rest).length === 0 && !existing.note;
          return {
            entries: emptied
              ? s.entries.filter((e) => e.date !== date)
              : s.entries.map((e) => (e.date === date ? { ...e, values: rest } : e)),
          };
        }),

      setNote: (note, date = todayISO()) =>
        setState((s) => {
          const existing = s.entries.find((e) => e.date === date);
          const trimmed = note.trim();
          const next: JournalEntry = existing
            ? { ...existing, note: trimmed || undefined }
            : { date, values: {}, note: trimmed || undefined };
          if (!trimmed && Object.keys(next.values).length === 0) {
            return { entries: s.entries.filter((e) => e.date !== date) };
          }
          return { entries: [next, ...s.entries.filter((e) => e.date !== date)] };
        }),

      forDate: (date) => get().entries.find((e) => e.date === date) ?? null,

      addCustomFactor: (factor) =>
        setState((s) => {
          const key = factor.key.trim();
          if (!key || s.customFactors.some((f) => f.key === key)) return s;
          if (BUILT_IN_FACTORS.some((f) => f.key === key)) return s;
          return {
            customFactors: [...s.customFactors, { ...factor, key, builtIn: false }],
            enabledKeys: [...s.enabledKeys, key],
          };
        }),

      removeCustomFactor: (key) =>
        setState((s) => ({
          customFactors: s.customFactors.filter((f) => f.key !== key),
          enabledKeys: s.enabledKeys.filter((k) => k !== key),
          // The recorded values stay. Removing a question does not un-ask it
          // of the days it was already answered on.
        })),

      toggleFactor: (key) =>
        setState((s) => ({
          enabledKeys: s.enabledKeys.includes(key)
            ? s.enabledKeys.filter((k) => k !== key)
            : [...s.enabledKeys, key],
        })),

      factors: () => {
        const all = [...BUILT_IN_FACTORS, ...get().customFactors];
        const enabled = get().enabledKeys;
        return all.filter((f) => enabled.includes(f.key));
      },

      clear: () => setState({ entries: [], customFactors: [], enabledKeys: DEFAULT_ENABLED }),
    }),
    { name: STORE_KEYS.journal, storage: jsonStorage() },
  ),
);
