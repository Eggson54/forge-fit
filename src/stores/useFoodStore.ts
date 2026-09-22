import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/uid';
import { FOOD_DB } from '../data/foods';
import {
  findByBarcode,
  normaliseBarcode,
  searchLibrary,
  type LibraryFood,
} from '../domain/foodLibrary';
import type { FoodMacros } from '../domain/types';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * The athlete's own food library.
 *
 * Only their additions are stored; the bundled staples are code and would be
 * a hundred kilobytes of duplicated JSON in every backup if they were not.
 * They are merged in on read, so an update to the staple list reaches
 * everybody without a migration.
 */

interface FoodState {
  /** Custom and scanned foods only. The bundled ones are merged on read. */
  mine: LibraryFood[];

  add: (input: {
    name: string;
    brand?: string;
    servingLabel: string;
    macros: FoodMacros;
    barcode?: string;
    estimated?: boolean;
  }) => LibraryFood;
  update: (id: string, patch: Partial<Omit<LibraryFood, 'id' | 'source'>>) => void;
  remove: (id: string) => void;
  /** Bump the use count, so search learns what this person eats. */
  noteUse: (id: string) => void;

  all: () => LibraryFood[];
  search: (query: string, limit?: number) => LibraryFood[];
  byBarcode: (code: string) => LibraryFood | null;
  reset: () => void;
}

/** The staples, as library entries. Rebuilt per call is wasteful, so it is not. */
const BUNDLED: LibraryFood[] = FOOD_DB.map((f) => ({ ...f, source: 'bundled' as const }));

export const useFoodStore = create<FoodState>()(
  persist(
    (set, get) => ({
      mine: [],

      add: ({ name, brand, servingLabel, macros, barcode, estimated }) => {
        const code = barcode ? normaliseBarcode(barcode) : undefined;
        const food: LibraryFood = {
          id: uid('food_'),
          name: name.trim() || 'Unnamed food',
          ...(brand?.trim() ? { brand: brand.trim() } : null),
          servingLabel: servingLabel.trim() || '1 serving',
          ...macros,
          source: code ? 'scanned' : 'custom',
          ...(code ? { barcode: code } : null),
          ...(estimated ? { estimated: true } : null),
          uses: 0,
        };
        // A code already known is updated rather than duplicated: scanning the
        // same tin twice must not produce two entries that then diverge.
        set((s) => ({
          mine: code && findByBarcode(s.mine, code)
            ? s.mine.map((f) => (f.barcode && normaliseBarcode(f.barcode) === code ? { ...food, id: f.id, uses: f.uses } : f))
            : [...s.mine, food],
        }));
        return food;
      },

      update: (id, patch) =>
        set((s) => ({ mine: s.mine.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

      remove: (id) => set((s) => ({ mine: s.mine.filter((f) => f.id !== id) })),

      noteUse: (id) =>
        set((s) => ({
          mine: s.mine.map((f) =>
            f.id === id ? { ...f, uses: (f.uses ?? 0) + 1, lastUsedAt: new Date().toISOString() } : f,
          ),
        })),

      all: () => [...get().mine, ...BUNDLED],
      search: (query, limit) => searchLibrary(get().all(), query, limit),
      byBarcode: (code) => findByBarcode(get().mine, code),

      reset: () => set({ mine: [] }),
    }),
    { name: STORE_KEYS.foods, storage: jsonStorage() },
  ),
);
