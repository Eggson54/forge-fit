/**
 * What the app is connected to, and — just as important — what it is only
 * pretending to be connected to.
 *
 * Every one of these providers needs something the JavaScript bundle cannot
 * supply on its own: HealthKit needs a native module compiled into the binary,
 * the Watch needs a watchOS target, Strava needs a client secret that must
 * never ship in an app. So the honest states are not "on" and "off" — they are
 * connected, connecting, failed, and *not possible on this build*, and the UI
 * has to be able to tell the last one apart from the others.
 *
 * Getting that wrong is how an app ends up with a green "Connected" badge over
 * numbers it invented.
 */

export type ProviderId = 'apple_health' | 'apple_watch' | 'strava';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  apple_health: 'Apple Health',
  apple_watch: 'Apple Watch',
  strava: 'Strava',
};

export type LinkState =
  /** Never connected, or deliberately disconnected. */
  | 'disconnected'
  /** A connect attempt is in flight. */
  | 'connecting'
  /** Live, with a real token or real permission. */
  | 'connected'
  /** Tried and failed; `error` says why. */
  | 'error'
  /**
   * Cannot work on this build or platform at all — no native module, wrong
   * OS, or no configured backend. Not a failure the user can retry away.
   */
  | 'unavailable'
  /**
   * Connected, but serving sample data because the real source is not wired
   * up. Never counted as connected, and always labelled on screen.
   */
  | 'demo';

export interface ProviderStatus {
  id: ProviderId;
  state: LinkState;
  /** Who we are connected as, when the provider names an account. */
  account?: string | null;
  lastSyncedAt?: string | null;
  error?: string | null;
  /** Permissions actually granted, which is rarely everything asked for. */
  grantedScopes?: string[];
}

export function isLive(status: ProviderStatus): boolean {
  return status.state === 'connected';
}

/** True when the app may show numbers attributed to this provider. */
export function producesData(status: ProviderStatus): boolean {
  return status.state === 'connected' || status.state === 'demo';
}

export interface Capability {
  /** The device and build can talk to this provider at all. */
  supported: boolean;
  /** Why not, in the words the screen shows. Null when supported. */
  reason: string | null;
}

/**
 * Whether a provider can work here, and what to say when it cannot.
 *
 * The reasons are specific on purpose. "Not available" tells nobody anything;
 * "needs a development build — Expo Go cannot load HealthKit" tells them
 * exactly which of their options is the one that works.
 */
export function capabilityFor(
  id: ProviderId,
  env: { platform: 'ios' | 'android' | 'web'; hasNativeModule: boolean; backendConfigured: boolean },
): Capability {
  if (id === 'strava') {
    if (!env.backendConfigured) {
      return {
        supported: false,
        reason:
          'Strava needs a client ID and the token-exchange endpoint set in your environment. The client secret must stay on the server, so the app cannot complete the handshake on its own.',
      };
    }
    if (env.platform === 'web') {
      return {
        supported: false,
        reason: 'Strava sign-in opens outside the browser preview. Connect it in the iOS or Android app.',
      };
    }
    return { supported: true, reason: null };
  }

  if (env.platform === 'android') {
    return {
      supported: false,
      reason:
        id === 'apple_watch'
          ? 'Apple Watch is iOS only. Android wearables sync through Health Connect instead.'
          : 'Apple Health is iOS only. On Android this reads from Health Connect.',
    };
  }
  if (env.platform === 'web') {
    return { supported: false, reason: 'Health data is only available in the iOS app.' };
  }
  if (!env.hasNativeModule) {
    return {
      supported: false,
      reason:
        'Needs a development build. HealthKit is a native framework, and Expo Go cannot load it — run `npx expo run:ios` or install a build from EAS and this turns on.',
    };
  }
  return { supported: true, reason: null };
}

export interface SyncOutcome {
  imported: number;
  /** Already held under the same external id. */
  skipped: number;
  errors: string[];
}

export const EMPTY_SYNC: SyncOutcome = { imported: 0, skipped: 0, errors: [] };

export function mergeSync(a: SyncOutcome, b: SyncOutcome): SyncOutcome {
  return {
    imported: a.imported + b.imported,
    skipped: a.skipped + b.skipped,
    errors: [...a.errors, ...b.errors],
  };
}

/** One line for after a sync. Says nothing happened when nothing happened. */
export function summariseSync(o: SyncOutcome): string {
  if (o.errors.length > 0 && o.imported === 0) {
    return o.errors[0]!;
  }
  if (o.imported === 0 && o.skipped === 0) return 'Nothing new to bring in.';
  if (o.imported === 0) {
    return `Up to date — ${o.skipped} ${o.skipped === 1 ? 'activity was' : 'activities were'} already here.`;
  }
  const brought = `Brought in ${o.imported} ${o.imported === 1 ? 'activity' : 'activities'}`;
  if (o.skipped === 0) return `${brought}.`;
  return `${brought}; ${o.skipped} ${o.skipped === 1 ? 'was' : 'were'} already here.`;
}

/** "just now", "4 minutes ago", "yesterday". */
export function sinceLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Whether enough time has passed to sync again without being asked. */
export function syncDue(
  lastSyncedAt: string | null | undefined,
  everyMinutes = 30,
  now: Date = new Date(),
): boolean {
  if (!lastSyncedAt) return true;
  const then = new Date(lastSyncedAt);
  if (Number.isNaN(then.getTime())) return true;
  return now.getTime() - then.getTime() >= everyMinutes * 60_000;
}

/** The status line under a provider's name. */
export function describeStatus(status: ProviderStatus, now: Date = new Date()): string {
  switch (status.state) {
    case 'connected': {
      const who = status.account ? `Connected as ${status.account}` : 'Connected';
      const when = sinceLabel(status.lastSyncedAt, now);
      return when ? `${who} · synced ${when}` : who;
    }
    case 'connecting':
      return 'Connecting…';
    case 'error':
      return status.error ?? 'Could not connect.';
    case 'unavailable':
      // Deliberately short. The reason is long and specific and belongs in
      // the "why not" card below — printing it twice made the card look like
      // an error rather than an explanation.
      return 'Not available on this build.';
    case 'demo':
      return 'Showing sample data — not your real numbers.';
    case 'disconnected':
    default:
      return 'Not connected.';
  }
}

/**
 * What a failed request means for the connection.
 *
 * A 401 means the token is gone and the user has to sign in again; a 429 is
 * Strava's rate limit and will pass on its own; anything else is probably the
 * network. Treating all three the same is how apps end up telling people to
 * reconnect an account that was never disconnected.
 */
export function classifyHttpFailure(statusCode: number): {
  disconnects: boolean;
  retryable: boolean;
  message: string;
} {
  if (statusCode === 401 || statusCode === 403) {
    return {
      disconnects: true,
      retryable: false,
      message: 'Strava signed you out. Connect again to keep importing.',
    };
  }
  if (statusCode === 429) {
    return {
      disconnects: false,
      retryable: true,
      message: 'Strava is rate-limiting requests right now. It will catch up on the next sync.',
    };
  }
  if (statusCode >= 500) {
    return { disconnects: false, retryable: true, message: 'Strava is having trouble. Try again shortly.' };
  }
  return { disconnects: false, retryable: false, message: `Strava refused the request (${statusCode}).` };
}

/** Seconds of headroom before an access token is treated as expired. */
export const TOKEN_SKEW_SECONDS = 120;

/** True when a token needs refreshing before the next request. */
export function tokenExpired(expiresAtEpochSeconds: number | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAtEpochSeconds) return true;
  return expiresAtEpochSeconds - TOKEN_SKEW_SECONDS <= Math.floor(now.getTime() / 1000);
}
