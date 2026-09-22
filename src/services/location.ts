import { Platform } from 'react-native';
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

/** Why a position could not be read. Surfaced rather than swallowed: a map that
 *  silently shows nothing is indistinguishable from a map that is broken. */
export type LocationError = 'denied' | 'unavailable' | 'timeout' | null;

let lastError: LocationError = null;
export const locationError = () => lastError;

// --- Web -------------------------------------------------------------------
// expo-location's web support is thin, and the browser already exposes exactly
// what this feature needs. Going straight to the platform API keeps the web
// build — which is how most people will first see this — actually working.

const hasBrowserGeo = () =>
  typeof navigator !== 'undefined' && typeof navigator.geolocation?.getCurrentPosition === 'function';

function browserFix(): Promise<LocationFix | null> {
  return new Promise((resolve) => {
    if (!hasBrowserGeo()) {
      lastError = 'unavailable';
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastError = null;
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracyMeters: p.coords.accuracy ?? null,
          at: new Date().toISOString(),
        });
      },
      (e) => {
        lastError = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable';
        resolve(null);
      },
      // No high accuracy: the nearest gym is not a GPS-grade question, and
      // asking for it costs battery and a slower first fix.
      //
      // maximumAge is 0 because a cached position is the wrong answer to the
      // question this feature asks. Allowing a 30-second-old fix meant walking
      // into a gym and being told you were still out on the street. Reads only
      // happen when a gym screen is opened, so this is not a battery drain.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  });
}

async function browserPermission(): Promise<LocationStatus> {
  if (!hasBrowserGeo()) return 'unavailable';
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (p?.state === 'granted') return 'granted';
    if (p?.state === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// --- Native ----------------------------------------------------------------

interface NativeFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude?: number | null;
    speed?: number | null;
  };
  timestamp?: number;
}

interface LocationModule {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (opts: { accuracy: number }) => Promise<NativeFix>;
  watchPositionAsync: (
    opts: { accuracy: number; timeInterval?: number; distanceInterval?: number },
    callback: (fix: NativeFix) => void,
  ) => Promise<{ remove: () => void }>;
  Accuracy: { Balanced: number; BestForNavigation: number };
}

/** A fix as a recorder wants it: raw numbers, with whatever extras came along. */
export interface StreamFix {
  lat: number;
  lon: number;
  /** Milliseconds since epoch. */
  t: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  speedMs: number | null;
}

export type StopWatching = () => void;

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
    if (Platform.OS === 'web') return browserPermission();
    const m = load();
    if (!m) return 'unavailable';
    try {
      const { status } = await m.getForegroundPermissionsAsync();
      return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'unknown';
    } catch {
      return 'unavailable';
    }
  },

  /**
   * Asks for permission. Only ever called from an explicit user action.
   *
   * Returns the position when granting produced one, so the caller does not
   * immediately ask for a second fix it already has — two reads back to back
   * is both wasteful and, on some platforms, unreliable.
   */
  async request(): Promise<{ status: LocationStatus; fix: LocationFix | null }> {
    if (Platform.OS === 'web') {
      // The browser has no separate request step: the prompt appears on the
      // first read, so the read *is* the request.
      const fix = await browserFix();
      if (fix) return { status: 'granted', fix };
      return { status: lastError === 'denied' ? 'denied' : 'unavailable', fix: null };
    }
    const m = load();
    if (!m) return { status: 'unavailable', fix: null };
    try {
      const { status } = await m.requestForegroundPermissionsAsync();
      if (status !== 'granted') return { status: 'denied', fix: null };
      return { status: 'granted', fix: await this.current() };
    } catch {
      return { status: 'unavailable', fix: null };
    }
  },

  /**
   * A stream of fixes, for recording.
   *
   * `BestForNavigation` rather than `Balanced`: a recorded track is the one
   * case where the battery cost is the point of the exercise. One fix a
   * second is what every GPS watch does and what the analysis downstream
   * assumes — coarser sampling puts split boundaries and segment gates in the
   * wrong place.
   *
   * Returns a stop function, always. A recorder that cannot turn the receiver
   * off is a recorder that flattens the phone.
   */
  async watch(onFix: (fix: StreamFix) => void): Promise<StopWatching> {
    if (Platform.OS === 'web') {
      const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
      if (!geo?.watchPosition) return () => {};
      const id = geo.watchPosition(
        (pos) =>
          onFix({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            t: pos.timestamp ?? Date.now(),
            accuracyMeters: pos.coords.accuracy ?? null,
            altitudeMeters: pos.coords.altitude ?? null,
            speedMs: pos.coords.speed ?? null,
          }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
      return () => geo.clearWatch(id);
    }

    const m = load();
    if (!m?.watchPositionAsync) return () => {};
    try {
      const sub = await m.watchPositionAsync(
        { accuracy: m.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (pos) =>
          onFix({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            t: pos.timestamp ?? Date.now(),
            accuracyMeters: pos.coords.accuracy ?? null,
            altitudeMeters: pos.coords.altitude ?? null,
            speedMs: pos.coords.speed ?? null,
          }),
      );
      return () => sub.remove();
    } catch {
      return () => {};
    }
  },

  async current(): Promise<LocationFix | null> {
    if (Platform.OS === 'web') return browserFix();
    const m = load();
    if (!m) {
      lastError = 'unavailable';
      return null;
    }
    try {
      const pos = await m.getCurrentPositionAsync({ accuracy: m.Accuracy.Balanced });
      lastError = null;
      return {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        at: new Date().toISOString(),
      };
    } catch {
      lastError = 'unavailable';
      return null;
    }
  },
};
