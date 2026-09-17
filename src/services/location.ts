import type { LatLon } from '../domain/geo';

/**
 * Coarse location, used only by the gym map.
 *
 * Three rules this module exists to enforce:
 *
 * - Nothing is requested until the user opts in from the map screen. The
 *   permission prompt never fires on launch.
 * - Only "balanced" accuracy is asked for. Finding which gym you are standing
 *   outside does not need the precision that tracks a running route.
 * - Positions stay on the device. What leaves, when a gym source is configured,
 *   is a coordinate rounded to three decimals — roughly a 110 m square.
 */
export interface LocationFix extends LatLon {
  accuracyMeters: number | null;
  at: string;
}

export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

interface LocationModule {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (opts: { accuracy: number }) => Promise<{
    coords: { latitude: number; longitude: number; accuracy: number | null };
  }>;
  Accuracy: { Balanced: number };
}

let mod: LocationModule | null | undefined;
function load(): LocationModule | null {
  if (mod !== undefined) return mod;
  try {
    // Required lazily so a build without the native module still loads the app
    // and simply reports location as unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('expo-location') as LocationModule;
  } catch {
    mod = null;
  }
  return mod;
}

export const location = {
  async status(): Promise<LocationStatus> {
    const m = load();
    if (!m) return 'unavailable';
    try {
      const { status } = await m.getForegroundPermissionsAsync();
      return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'unknown';
    } catch {
      return 'unavailable';
    }
  },

  /** Asks for permission. Only ever called from an explicit user action. */
  async request(): Promise<LocationStatus> {
    const m = load();
    if (!m) return 'unavailable';
    try {
      const { status } = await m.requestForegroundPermissionsAsync();
      return status === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  },

  async current(): Promise<LocationFix | null> {
    const m = load();
    if (!m) return null;
    try {
      const pos = await m.getCurrentPositionAsync({ accuracy: m.Accuracy.Balanced });
      return {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },
};
