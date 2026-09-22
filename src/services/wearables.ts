import {
  normaliseActivity,
  normaliseRecovery,
  normaliseSleep,
  type NormalisedDay,
  type NormalisedSleep,
  type OwActivitySummary,
  type OwRecoverySummary,
  type OwSleepSummary,
  type Paginated,
} from '../domain/wearables';
import type { VitalsDay } from '../domain/vitals';

/**
 * Talking to an Open Wearables deployment.
 *
 * Two rules shape this file:
 *
 *  - **No secret ever reaches here.** The app never sees the master API key
 *    or the app secret. It asks *our* backend for a short-lived, user-scoped
 *    JWT and uses that. A leaked JWT is one user's data for an hour; a leaked
 *    app secret is everybody's, forever.
 *  - **Every call can come back empty and that is not an error.** Coverage
 *    varies by provider and by how often somebody wears the thing. The caller
 *    gets an outcome it can show, never an exception it has to guess about.
 */

export type WearablesOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_configured'; reason: string }
  | { kind: 'auth'; reason: string }
  | { kind: 'unreachable'; reason: string };

interface Config {
  /** The Open Wearables deployment, e.g. https://wearables.example.com */
  baseUrl: string;
  /** Our own endpoint that mints a token. Never the service's own. */
  tokenUrl: string;
  /** This athlete's id inside that deployment. */
  userId: string;
}

let cached: { token: string; expiresAt: number } | null = null;

function envConfig(): Config | null {
  const baseUrl = process.env.EXPO_PUBLIC_OPEN_WEARABLES_URL ?? '';
  const tokenUrl = process.env.EXPO_PUBLIC_OPEN_WEARABLES_TOKEN_URL ?? '';
  return baseUrl && tokenUrl ? { baseUrl, tokenUrl, userId: '' } : null;
}

export const wearables = {
  configured(): boolean {
    return envConfig() !== null;
  },

  /** Forget the cached token — on sign-out, or when the user id changes. */
  forget(): void {
    cached = null;
  },

  /**
   * A usable token, minted or reused.
   *
   * Refreshed a minute early: a token that expires while a request is in
   * flight produces a 401 that looks exactly like a configuration problem.
   */
  async token(userId: string): Promise<string | null> {
    const config = envConfig();
    if (!config || !userId) return null;
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { accessToken?: string; expiresIn?: number };
      if (!body.accessToken) return null;
      cached = {
        token: body.accessToken,
        expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000,
      };
      return cached.token;
    } catch {
      return null;
    }
  },

  async sleep(userId: string, from: string, to: string): Promise<WearablesOutcome<NormalisedSleep[]>> {
    return this.fetchSummary<OwSleepSummary, NormalisedSleep[]>(userId, 'sleep', from, to, normaliseSleep);
  },

  async activity(userId: string, from: string, to: string): Promise<WearablesOutcome<NormalisedDay[]>> {
    return this.fetchSummary<OwActivitySummary, NormalisedDay[]>(userId, 'activity', from, to, normaliseActivity);
  },

  async recovery(
    userId: string,
    from: string,
    to: string,
  ): Promise<WearablesOutcome<(VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[]>> {
    return this.fetchSummary<OwRecoverySummary, (VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[]>(
      userId, 'recovery', from, to, normaliseRecovery,
    );
  },

  /**
   * One summary endpoint, paged to the end.
   *
   * Their list endpoints are cursor-paginated and a year of daily rows is
   * several pages. Stopping at the first page would silently give somebody
   * the most recent fortnight and call it a year — the kind of wrong that
   * looks right until a chart is compared against the source.
   */
  async fetchSummary<Row, Out>(
    userId: string,
    kind: 'sleep' | 'activity' | 'recovery',
    from: string,
    to: string,
    normalise: (rows: Row[]) => Out,
  ): Promise<WearablesOutcome<Out>> {
    const config = envConfig();
    if (!config) {
      return {
        kind: 'not_configured',
        reason: 'No Open Wearables deployment is set for this build. It is a service you run yourself.',
      };
    }

    const token = await this.token(userId);
    if (!token) {
      return { kind: 'auth', reason: 'Could not get a token for your account from the backend.' };
    }

    const rows: Row[] = [];
    let cursor: string | null = null;
    // A hard stop, so a service that always reports another page cannot spin
    // here forever with the screen showing a spinner.
    for (let page = 0; page < 40; page++) {
      const url = new URL(`${config.baseUrl.replace(/\/+$/, '')}/api/v1/users/${userId}/summaries/${kind}`);
      url.searchParams.set('start_date', from);
      url.searchParams.set('end_date', to);
      if (cursor) url.searchParams.set('cursor', cursor);

      try {
        const response: Response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401 || response.status === 403) {
          cached = null;
          return { kind: 'auth', reason: 'That token was refused. It may have expired — try again.' };
        }
        if (!response.ok) {
          return { kind: 'unreachable', reason: `The service answered ${response.status}.` };
        }

        const body = (await response.json()) as Paginated<Row>;
        rows.push(...(body.data ?? []));
        cursor = body.pagination?.next_cursor ?? null;
        if (!cursor || !body.pagination?.has_more) break;
      } catch (e) {
        return { kind: 'unreachable', reason: (e as Error).message || 'Could not reach the service.' };
      }
    }

    return { kind: 'ok', data: normalise(rows) };
  },
};
