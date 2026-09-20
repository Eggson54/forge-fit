import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import { uid } from '../lib/uid';
import { jsonStorage, STORE_KEYS } from './persist';

export interface CoachTurn {
  id: string;
  role: 'coach' | 'you';
  text: string;
  date: string;
  at: string;
  /** Tone the coach replied in, when it reported one. */
  tone?: string;
  /**
   * Set when this turn is the coach declining rather than coaching — a
   * question about doses, an injury, or one it did not follow. Stored so the
   * marking survives a reload of the thread.
   */
  declined?: 'medical' | 'injury' | 'unknown';
}

/**
 * The conversation is capped rather than unbounded. A coach thread is a log of
 * nudges, not a document, and an unbounded array in AsyncStorage grows until it
 * costs real time to rehydrate on launch.
 */
const MAX_TURNS = 60;

interface CoachState {
  turns: CoachTurn[];
  /** Set of dates the opening message has already been generated for. */
  greetedOn: string | null;

  append: (turn: Omit<CoachTurn, 'id' | 'date' | 'at'>) => void;
  markGreeted: () => void;
  /** Whether today still needs an opening message. */
  needsGreeting: () => boolean;
  clear: () => void;
  reset: () => void;
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set, get) => ({
      turns: [],
      greetedOn: null,

      append: (turn) =>
        set((s) => ({
          turns: [
            ...s.turns,
            { ...turn, id: uid('turn_'), date: todayISO(), at: new Date().toISOString() },
          ].slice(-MAX_TURNS),
        })),

      markGreeted: () => set({ greetedOn: todayISO() }),

      // A fresh push every time the screen mounts would bury yesterday's thread
      // under duplicates; once a day is the cadence the message is written for.
      needsGreeting: () => get().greetedOn !== todayISO(),

      clear: () => set({ turns: [], greetedOn: null }),
      reset: () => set({ turns: [], greetedOn: null }),
    }),
    { name: STORE_KEYS.coach, storage: jsonStorage() },
  ),
);
