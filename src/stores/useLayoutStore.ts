import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_ACTION,
  DEFAULT_ORDER,
  move,
  resolveHidden,
  resolveOrder,
  toggleHidden,
  toggleTab,
  visibleSections,
  visibleTabs,
  type ActionKey,
  type HomeSectionKey,
  type TabKey,
} from '../domain/layout';
import { jsonStorage, STORE_KEYS } from './persist';

interface LayoutState {
  order: HomeSectionKey[];
  hidden: HomeSectionKey[];
  hiddenTabs: string[];
  action: ActionKey;

  moveSection: (key: HomeSectionKey, delta: number) => void;
  toggleSection: (key: HomeSectionKey) => void;
  toggleTabKey: (key: TabKey) => void;
  setAction: (key: ActionKey) => void;
  sections: () => HomeSectionKey[];
  tabs: () => TabKey[];
  reset: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      order: DEFAULT_ORDER,
      hidden: [],
      hiddenTabs: [],
      action: DEFAULT_ACTION,

      moveSection: (key, delta) => set((s) => ({ order: move(resolveOrder(s.order), key, delta) })),
      toggleSection: (key) => set((s) => ({ hidden: toggleHidden(resolveHidden(s.hidden), key) })),
      toggleTabKey: (key) => set((s) => ({ hiddenTabs: toggleTab(s.hiddenTabs, key) })),
      setAction: (key) => set({ action: key }),

      // Resolved on read, so a layout stored before a section existed still
      // shows it and a key this build no longer knows is dropped.
      sections: () => visibleSections({ order: get().order, hidden: get().hidden }),
      tabs: () => visibleTabs(get().hiddenTabs),

      reset: () => set({ order: DEFAULT_ORDER, hidden: [], hiddenTabs: [], action: DEFAULT_ACTION }),
    }),
    { name: STORE_KEYS.layout, storage: jsonStorage() },
  ),
);
