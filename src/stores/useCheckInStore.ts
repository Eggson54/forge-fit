import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import {
  DEFAULT_CHECK_INS,
  dueNow,
  ghostActive,
  type CheckIn,
  type CheckInCadence,
  type GhostMode,
  type ThinkingMode,
} from '../domain/checkIns';
import { jsonStorage, STORE_KEYS } from './persist';

interface CheckInState {
  checkIns: CheckIn[];
  ghost: GhostMode;
  thinking: ThinkingMode;

  setCadence: (id: string, cadence: CheckInCadence) => void;
  setTime: (id: string, minutes: number) => void;
  toggle: (id: string) => void;
  markFired: (id: string, date?: string) => void;
  due: (now?: Date) => CheckIn[];
  setGhost: (ghost: GhostMode) => void;
  quiet: () => boolean;
  setThinking: (mode: ThinkingMode) => void;
  reset: () => void;
}

const seeded = (): CheckIn[] =>
  DEFAULT_CHECK_INS.map((c, i) => ({ ...c, id: `ci_${i}`, lastFiredOn: null }));

export const useCheckInStore = create<CheckInState>()(
  persist(
    (set, get) => ({
      checkIns: seeded(),
      ghost: { on: false, until: null },
      thinking: 'adaptive',

      setCadence: (id, cadence) =>
        set((s) => ({ checkIns: s.checkIns.map((c) => (c.id === id ? { ...c, cadence } : c)) })),
      setTime: (id, minutes) =>
        set((s) => ({
          checkIns: s.checkIns.map((c) =>
            c.id === id ? { ...c, timeMinutes: Math.max(0, Math.min(1439, minutes)) } : c,
          ),
        })),
      toggle: (id) =>
        set((s) => ({ checkIns: s.checkIns.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)) })),
      markFired: (id, date = todayISO()) =>
        set((s) => ({ checkIns: s.checkIns.map((c) => (c.id === id ? { ...c, lastFiredOn: date } : c)) })),

      // Ghost Mode wins over every schedule. That is the whole promise of it.
      due: (now = new Date()) => (get().quiet() ? [] : dueNow(get().checkIns, now)),

      setGhost: (ghost) => set({ ghost }),
      quiet: () => ghostActive(get().ghost),
      setThinking: (mode) => set({ thinking: mode }),

      reset: () => set({ checkIns: seeded(), ghost: { on: false, until: null }, thinking: 'adaptive' }),
    }),
    { name: STORE_KEYS.checkIns, storage: jsonStorage() },
  ),
);
