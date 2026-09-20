/**
 * The seam between the rest timer and the operating system.
 *
 * The rest store has to stay free of anything that imports react-native, both
 * because it is unit-tested and because a countdown should never fail on a
 * notification subsystem. So it talks to this, and the app installs the real
 * implementation at startup. Left alone, every call is a no-op and the timer
 * works exactly as it did before — silently.
 */
export interface RestAlerts {
  /** Returns an id to cancel with, or null if the OS would not take it. */
  schedule(seconds: number, label: string): Promise<string | null>;
  cancel(id: string): void;
}

const NOOP: RestAlerts = {
  schedule: async () => null,
  cancel: () => {},
};

let current: RestAlerts = NOOP;

export function setRestAlerts(alerts: RestAlerts): void {
  current = alerts;
}

export function restAlerts(): RestAlerts {
  return current;
}

/** Restore the no-op adapter. Used by tests, and by sign-out. */
export function resetRestAlerts(): void {
  current = NOOP;
}
