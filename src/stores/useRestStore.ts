import { create } from 'zustand';
import { restAlerts } from './restAlerts';

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
  /**
   * The pending OS alert for this rest, when one could be scheduled. Held so
   * that skipping or shortening a rest cancels the buzz that was already
   * queued for the original deadline.
   */
  notificationId: string | null;

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
  notificationId: null,

  start: (seconds, label) => {
    const safe = Math.max(1, Math.round(seconds));
    clearAlert(get().notificationId);
    set({
      endsAt: Date.now() + safe * 1000,
      totalSeconds: safe,
      label,
      startedAt: Date.now(),
      notificationId: null,
    });
    queueAlert(safe, label, Date.now() + safe * 1000);
  },

  adjust: (deltaSeconds) => {
    const { endsAt, totalSeconds } = get();
    if (endsAt == null) return;
    // Never below the current moment: an adjustment that ends the rest in the
    // past would render as a timer stuck at zero rather than a finished one.
    const next = Math.max(Date.now() + 1000, endsAt + deltaSeconds * 1000);
    clearAlert(get().notificationId);
    set({ endsAt: next, totalSeconds: Math.max(1, totalSeconds + deltaSeconds), notificationId: null });
    queueAlert(Math.round((next - Date.now()) / 1000), get().label, next);
  },

  dismiss: () => {
    clearAlert(get().notificationId);
    set({ endsAt: null, totalSeconds: 0, label: '', notificationId: null });
  },
}));

/** Fire-and-forget: a rest must never wait on the notification subsystem. */
function queueAlert(seconds: number, label: string, forDeadline: number): void {
  restAlerts()
    .schedule(seconds, label)
    .then((id) => {
      // The rest may have been skipped or restarted while this was in flight.
      // Cancel rather than leaving an orphan alert pointed at a dead deadline.
      if (!id) return;
      if (useRestStore.getState().endsAt !== forDeadline) clearAlert(id);
      else useRestStore.setState({ notificationId: id });
    })
    .catch(() => {});
}

function clearAlert(id: string | null): void {
  if (id) restAlerts().cancel(id);
}
