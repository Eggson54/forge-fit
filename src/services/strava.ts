import { Platform } from 'react-native';
import { config } from './config';
import { secureStore } from './storage';

/**
 * Strava integration. Imports the user's recent activities (runs, rides, swims)
 * as cardio sessions + calories. Real OAuth requires a backend to exchange the
 * code for a token (the client secret must never live in the app), so when
 * unconfigured this uses a deterministic mock so the flow is demonstrable.
 */
export interface StravaActivity {
  id: string;
  type: string; // Run, Ride, Swim, Walk, Workout
  name: string;
  date: string; // ISO date
  movingMinutes: number;
  distanceKm: number;
  calories: number;
}

export interface StravaConnection {
  connected: boolean;
  athlete?: string;
}

const TOKEN_KEY = 'forgefit:strava_token';

function mockActivities(): StravaActivity[] {
  const today = new Date();
  const iso = (d: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    return dt.toISOString().slice(0, 10);
  };
  return [
    { id: 'm1', type: 'Run', name: 'Morning Run', date: iso(1), movingMinutes: 32, distanceKm: 5.2, calories: 410 },
    { id: 'm2', type: 'Ride', name: 'Evening Ride', date: iso(3), movingMinutes: 58, distanceKm: 22.4, calories: 620 },
    { id: 'm3', type: 'Run', name: 'Tempo Run', date: iso(5), movingMinutes: 26, distanceKm: 4.1, calories: 350 },
  ];
}

export const strava = {
  get usingRealOAuth() {
    return config.strava.enabled;
  },

  async getConnection(): Promise<StravaConnection> {
    const token = await secureStore.get(TOKEN_KEY);
    return token ? { connected: true, athlete: JSON.parse(token).athlete } : { connected: false };
  },

  /** Begin the connect flow. Real: OAuth + backend exchange. Mock: store a demo token. */
  async connect(): Promise<StravaConnection> {
    if (!config.strava.enabled) {
      const demo = { athlete: 'You (demo)', accessToken: 'demo' };
      await secureStore.set(TOKEN_KEY, JSON.stringify(demo));
      return { connected: true, athlete: demo.athlete };
    }
    // Real OAuth (native): expo-auth-session -> code -> POST to config.strava.exchangeUrl.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AuthSession = require('expo-auth-session');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WebBrowser = require('expo-web-browser');
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'forgefit', path: 'strava' });
      const authUrl =
        `https://www.strava.com/oauth/mobile/authorize?client_id=${config.strava.clientId}` +
        `&response_type=code&approval_prompt=auto&scope=activity:read` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== 'success' || !result.url) throw new Error('Strava connection cancelled.');
      const code = new URL(result.url).searchParams.get('code');
      const res = await fetch(config.strava.exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      await secureStore.set(TOKEN_KEY, JSON.stringify({ accessToken: data.access_token, athlete: data.athlete?.firstname ?? 'Athlete' }));
      return { connected: true, athlete: data.athlete?.firstname ?? 'Athlete' };
    } catch (e) {
      throw new Error((e as Error).message || 'Could not connect Strava.');
    }
  },

  async disconnect(): Promise<void> {
    await secureStore.remove(TOKEN_KEY);
  },

  async importRecentActivities(): Promise<StravaActivity[]> {
    const raw = await secureStore.get(TOKEN_KEY);
    if (!raw) return [];
    if (!config.strava.enabled) return mockActivities();
    try {
      const { accessToken } = JSON.parse(raw);
      const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=20', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const acts = (await res.json()) as any[];
      return acts.map((a) => ({
        id: String(a.id),
        type: a.type,
        name: a.name,
        date: (a.start_date_local ?? '').slice(0, 10),
        movingMinutes: Math.round((a.moving_time ?? 0) / 60),
        distanceKm: Math.round(((a.distance ?? 0) / 1000) * 10) / 10,
        calories: Math.round(a.calories ?? a.kilojoules ?? 0),
      }));
    } catch {
      return [];
    }
  },

  get platformNote() {
    return Platform.OS === 'web' ? 'Connect on the mobile app for live Strava sync.' : '';
  },
};
