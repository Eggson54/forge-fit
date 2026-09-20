import { create } from 'zustand';

/**
 * The rest timer, hoisted out of the workout screen.
 *
 * It used to live in that screen's state, so stepping out to check a food log
 * or look up a lift threw the countdown away — and stepping out mid-rest is
 * exactly what people do with ninety seconds to fill. Nothing here is
 * persisted: a rest you started before closing the app is a rest that finished
 * while it was closed.
 */
interface RestState {
  /** When the rest ends, in epoch milliseconds. Null when nothing is running. */
  endsAt: number | null;
  /** Total length, so a progress ring has a denominator. */
  totalSeconds: number;
  label: string;
  /** Bumped on every start, so the view can reset cleanly on a repeat. */
  startedAt: number;

  start: (seconds: number, label: string) => void;
  /** Move the finish line, for the +/- controls. */
  adjust: (deltaSeconds: number) => void;
  dismiss: () => void;
}

export const useRestStore = create<RestState>((set, get) => ({
  endsAt: null,
  totalSeconds: 0,
  label: '',
  startedAt: 0,

  start: (seconds, label) => {
    const safe = Math.max(1, Math.round(seconds));
    set({ endsAt: Date.now() + safe * 1000, totalSeconds: safe, label, startedAt: Date.now() });
  },

  adjust: (deltaSeconds) => {
    const { endsAt, totalSeconds } = get();
    if (endsAt == null) return;
    // Never below the current moment: an adjustment that ends the rest in the
    // past would render as a timer stuck at zero rather than a finished one.
    const next = Math.max(Date.now() + 1000, endsAt + deltaSeconds * 1000);
    set({ endsAt: next, totalSeconds: Math.max(1, totalSeconds + deltaSeconds) });
  },

  dismiss: () => set({ endsAt: null, totalSeconds: 0, label: '' }),
}));
