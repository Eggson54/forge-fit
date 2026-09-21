import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import type { BiomarkerReading } from '../domain/biomarkers';
import { jsonStorage, STORE_KEYS } from './persist';

interface BiomarkerState {
  readings: BiomarkerReading[];

  /**
   * Record a value. One marker can only have one reading per draw, so an
   * entry for the same marker and date replaces rather than stacks — two
   * conflicting LDLs from one blood draw is a data-entry slip, not a finding.
   */
  record: (input: Omit<BiomarkerReading, 'id'> & { id?: string }) => BiomarkerReading;
  remove: (id: string) => void;
  removeDraw: (date: string) => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `bm_${Date.now().toString(36)}_${(counter += 1)}`;

export const useBiomarkerStore = create<BiomarkerState>()(
  persist(
    (set) => ({
      readings: [],

      record: (input) => {
        const entry: BiomarkerReading = {
          id: input.id ?? nextId(),
          key: input.key,
          value: input.value,
          date: input.date || todayISO(),
          ...(input.refLow != null ? { refLow: input.refLow } : null),
          ...(input.refHigh != null ? { refHigh: input.refHigh } : null),
          ...(input.panelId ? { panelId: input.panelId } : null),
          ...(input.note ? { note: input.note } : null),
        };
        set((s) => ({
          readings: [
            entry,
            ...s.readings.filter((r) => !(r.key === entry.key && r.date === entry.date)),
          ],
        }));
        return entry;
      },

      remove: (id) => set((s) => ({ readings: s.readings.filter((r) => r.id !== id) })),
      removeDraw: (date) => set((s) => ({ readings: s.readings.filter((r) => r.date !== date) })),
      clear: () => set({ readings: [] }),
    }),
    { name: STORE_KEYS.biomarkers, storage: jsonStorage() },
  ),
);
