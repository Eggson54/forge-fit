import { Platform } from 'react-native';
import { config } from './config';
import { secureStore } from './storage';
import { classifyHttpFailure, tokenExpired } from '../domain/integrations';

/**
 * Strava, for real.
 *
 * The flow is the ordinary OAuth authorization-code grant with one rule that
 * shapes everything here: the client secret never enters this file. The app
 * opens Strava's consent page, catches the code on the redirect, and posts it
 * to our own `/api/strava/exchange`, which holds the secret and hands back
 * tokens. Same for refresh. An app that ships its client secret has, in
 * effect, published it.
 *
 * Without a client ID and an exchange URL configured, none of this can run,
 * and the app says so rather than faking a connection — see `demo` below for
 * the one case where sample data is produced, always labelled as sample data.
 */

export interface StravaActivity {
  id: string;
  type: string;
  name: string;
  /** Local date of the activity, YYYY-MM-DD. */
  date: string;
  movingMinutes: number;
  distanceKm: number;
  calories: number;
  /** Seconds since the epoch, used to ask Strava only for what is new. */
  startedAtEpoch: number;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  athlete: string | null;
  athleteId: number | null;
}

export class StravaError extends Error {
  readonly disconnects: boolean;
  readonly retryable: boolean;
  constructor(message: string, opts: { disconnects?: boolean; retryable?: boolean } = {}) {
    super(message);
    this.name = 'StravaError';
    this.disconnects = opts.disconnects ?? false;
    this.retryable = opts.retryable ?? false;
  }
}

const TOKEN_KEY = 'forgefit:strava_token';
/** Where the last import stopped, so a refresh is not a full re-download. */
const CURSOR_KEY = 'forgefit:strava_cursor';

async function readTokens(): Promise<StravaTokens | null> {
  const raw = await secureStore.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StravaTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt ?? 0,
      athlete: parsed.athlete ?? null,
      athleteId: parsed.athleteId ?? null,
    };
  } catch {
    return null;
  }
}

async function writeTokens(t: StravaTokens): Promise<void> {
  await secureStore.set(TOKEN_KEY, JSON.stringify(t));
}

/**
 * A valid access token, refreshing first if the stored one is close to
 * expiring.
 *
 * Strava rotates the refresh token on every refresh, so the new one is written
 * back every time. Keeping the old one is the classic way to be silently
 * signed out a few hours later.
 */
async function freshAccessToken(): Promise<StravaTokens> {
  const tokens = await readTokens();
  if (!tokens) throw new StravaError('Not connected to Strava.', { disconnects: true });
  if (!tokenExpired(tokens.expiresAt)) return tokens;

  const res = await fetch(`${config.strava.exchangeUrl.replace(/\/exchange$/, '')}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  }).catch(() => null);

  if (!res) throw new StravaError('Could not reach the server to refresh Strava.', { retryable: true });
  if (!res.ok) {
    const failure = classifyHttpFailure(res.status);
    if (failure.disconnects) await strava.disconnect();
    throw new StravaError(failure.message, failure);
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresAt: number };
  const next: StravaTokens = { ...tokens, ...data };
  await writeTokens(next);
  return next;
}

/** Sample activities, produced only in demo mode and always labelled as such. */
function demoActivities(): StravaActivity[] {
  const now = new Date();
  const back = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d;
  };
  return [
    { days: 1, type: 'Run', name: 'Morning Run', movingMinutes: 32, distanceKm: 5.2, calories: 410 },
    { days: 3, type: 'Ride', name: 'Evening Ride', movingMinutes: 58, distanceKm: 22.4, calories: 620 },
    { days: 5, type: 'Run', name: 'Tempo Run', movingMinutes: 26, distanceKm: 4.1, calories: 350 },
  ].map((a, i) => {
    const when = back(a.days);
    return {
      id: `demo-${i}`,
      type: a.type,
      name: a.name,
      date: when.toISOString().slice(0, 10),
      movingMinutes: a.movingMinutes,
      distanceKm: a.distanceKm,
      calories: a.calories,
      startedAtEpoch: Math.floor(when.getTime() / 1000),
    };
  });
}

export const strava = {
  /** True when a client ID and exchange endpoint are configured. */
  get configured() {
    return config.strava.enabled;
  },

  async isConnected(): Promise<boolean> {
    return (await readTokens()) !== null;
  },

  async account(): Promise<string | null> {
    return (await readTokens())?.athlete ?? null;
  },

  /**
   * Open Strava, catch the redirect, exchange the code on our server.
   *
   * `expo-auth-session` and `expo-web-browser` are required lazily so that a
   * web build — where neither can do anything useful — does not pull them in
   * at all.
   */
  async connect(): Promise<StravaTokens> {
    if (!config.strava.enabled) {
      throw new StravaError(
        'Strava is not configured. Set EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_EXCHANGE_URL, and the client secret on the server.',
      );
    }
    if (Platform.OS === 'web') {
      throw new StravaError('Connect Strava from the iOS or Android app.');
    }

    /* eslint-disable @typescript-eslint/no-var-requires */
    const AuthSession = require('expo-auth-session');
    const WebBrowser = require('expo-web-browser');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'forgefit', path: 'strava' });
    // `activity:read_all` would include private activities. We ask for the
    // narrower scope: this app has no business reading a run somebody marked
    // private.
    const authUrl =
      `https://www.strava.com/oauth/mobile/authorize?client_id=${encodeURIComponent(config.strava.clientId)}` +
      `&response_type=code&approval_prompt=auto&scope=activity:read` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new StravaError('Strava connection cancelled.');
    }
    if (result.type !== 'success' || !result.url) {
      throw new StravaError('Strava did not come back with an answer.');
    }

    const params = new URL(result.url).searchParams;
    const denied = params.get('error');
    if (denied) throw new StravaError(`Strava declined: ${denied}.`);
    const code = params.get('code');
    if (!code) throw new StravaError('Strava did not return an authorization code.');

    // Strava lists the scopes actually granted, which can be fewer than asked.
    const granted = (params.get('scope') ?? '').split(',').filter(Boolean);
    if (granted.length > 0 && !granted.some((s) => s.startsWith('activity:read'))) {
      throw new StravaError('Activity permission was not granted, so there is nothing to import.');
    }

    const res = await fetch(config.strava.exchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null);

    if (!res) throw new StravaError('Could not reach the server to finish connecting.', { retryable: true });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new StravaError(body.error ?? classifyHttpFailure(res.status).message);
    }

    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      athlete: { id: number; firstName: string | null; username: string | null } | null;
    };

    const tokens: StravaTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      athlete: data.athlete?.firstName ?? data.athlete?.username ?? 'Athlete',
      athleteId: data.athlete?.id ?? null,
    };
    await writeTokens(tokens);
    return tokens;
  },

  async disconnect(): Promise<void> {
    const tokens = await readTokens();
    // Tell Strava too, so the app stops appearing in the user's connected
    // apps list. A failure here must not stop the local disconnect.
    if (tokens) {
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }).catch(() => undefined);
    }
    await secureStore.remove(TOKEN_KEY);
    await secureStore.remove(CURSOR_KEY);
  },

  /**
   * Activities since the last import.
   *
   * Paged, and cursored on the newest activity we have already seen, so the
   * second sync costs one small request rather than re-downloading a year of
   * running. The cursor only moves forward on success.
   */
  async fetchActivities(opts: { sinceEpoch?: number; maxPages?: number } = {}): Promise<StravaActivity[]> {
    const cursorRaw = await secureStore.get(CURSOR_KEY);
    const after = opts.sinceEpoch ?? (cursorRaw ? Number(cursorRaw) : 0);
    const maxPages = opts.maxPages ?? 3;

    const tokens = await freshAccessToken();
    const out: StravaActivity[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const url =
        `https://www.strava.com/api/v3/athlete/activities?per_page=50&page=${page}` +
        (after > 0 ? `&after=${after}` : '');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.accessToken}` } }).catch(
        () => null,
      );
      if (!res) throw new StravaError('Could not reach Strava.', { retryable: true });
      if (!res.ok) {
        const failure = classifyHttpFailure(res.status);
        if (failure.disconnects) await strava.disconnect();
        throw new StravaError(failure.message, failure);
      }

      const batch = (await res.json()) as StravaApiActivity[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch.map(normalise));
      if (batch.length < 50) break;
    }

    if (out.length > 0) {
      const newest = Math.max(...out.map((a) => a.startedAtEpoch));
      await secureStore.set(CURSOR_KEY, String(newest));
    }
    return out;
  },

  /** Sample data for the browser preview, never presented as real. */
  demoActivities,

  /**
   * The exact redirect URI this build will send to Strava.
   *
   * Surfaced because it is the single most common reason a correct-looking
   * Strava setup fails: the callback domain registered on strava.com has to
   * match, and nobody can match a value they cannot see.
   */
  redirectUri(): string | null {
    if (Platform.OS === 'web') return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AuthSession = require('expo-auth-session');
      return AuthSession.makeRedirectUri({ scheme: 'forgefit', path: 'strava' });
    } catch {
      return null;
    }
  },

  /** Token state, for the diagnostics screen. Never returns the tokens. */
  async tokenState(): Promise<{ stored: boolean; expiresAt: number | null; expired: boolean }> {
    const tokens = await readTokens();
    if (!tokens) return { stored: false, expiresAt: null, expired: true };
    return { stored: true, expiresAt: tokens.expiresAt, expired: tokenExpired(tokens.expiresAt) };
  },

  /**
   * Prove the exchange endpoint is actually deployed and reachable.
   *
   * Posts a deliberately empty body: a well-formed 400 back means the route
   * exists and is running, which is exactly what needs checking. A 404 means
   * the function was never deployed; a network error means the URL is wrong.
   */
  async pingBackend(): Promise<{ ok: boolean; detail: string }> {
    if (!config.strava.exchangeUrl) return { ok: false, detail: 'No exchange URL configured.' };
    try {
      const res = await fetch(config.strava.exchangeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status === 400) return { ok: true, detail: 'Endpoint is live and validating input.' };
      if (res.status === 503) {
        return { ok: false, detail: 'Endpoint is live but the server has no Strava client secret set.' };
      }
      if (res.status === 404) return { ok: false, detail: 'No function at that URL — it was never deployed.' };
      return { ok: res.ok, detail: `Endpoint answered ${res.status}.` };
    } catch (e) {
      return { ok: false, detail: `Could not reach it: ${(e as Error).message}` };
    }
  },

  get platformNote() {
    return Platform.OS === 'web' ? 'Connect on the mobile app for live Strava sync.' : '';
  },
};

interface StravaApiActivity {
  id: number;
  type?: string;
  sport_type?: string;
  name?: string;
  start_date_local?: string;
  moving_time?: number;
  distance?: number;
  calories?: number;
  kilojoules?: number;
}

function normalise(a: StravaApiActivity): StravaActivity {
  const startedLocal = a.start_date_local ?? '';
  return {
    id: String(a.id),
    // `sport_type` is the newer, finer-grained field; `type` is the legacy one
    // and is still what older activities carry.
    type: a.sport_type ?? a.type ?? 'Workout',
    name: a.name ?? 'Activity',
    date: startedLocal.slice(0, 10),
    movingMinutes: Math.round((a.moving_time ?? 0) / 60),
    distanceKm: Math.round(((a.distance ?? 0) / 1000) * 10) / 10,
    // Strava only returns calories on the detail endpoint. Kilojoules of
    // mechanical work is the next best thing for a ride; roughly 1 kJ per
    // kcal, because a cyclist is about 24% efficient and the arithmetic
    // happens to cancel.
    calories: Math.round(a.calories ?? a.kilojoules ?? 0),
    startedAtEpoch: startedLocal ? Math.floor(new Date(startedLocal).getTime() / 1000) : 0,
  };
}
