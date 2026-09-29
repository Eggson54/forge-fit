import {
  normaliseActivity,
  normaliseRecovery,
  normaliseSleep,
  type NormalisedDay,
  type NormalisedSleep,
  type OwActivitySummary,
  type OwRecoverySummary,
  type OwSleepSummary,
} from '../domain/wearables';
import type { VitalsDay } from '../domain/vitals';
import { getSupabase } from './supabase';

/**
 * Talking to an Open Wearables deployment.
 *
 * Two rules shape this file:
 *
 *  - **The app never talks to the deployment directly.** It cannot: the
 *    summary endpoints depend on `ApiKeyDep`, and Open Wearables explicitly
 *    refuses an SDK-scoped token there — `get_current_developer_optional`
 *    returns None for any token carrying `scope: "sdk"`. The only credential
 *    those routes accept is the master API key, which grants every user's
 *    data and must never be in a mobile bundle. So calls go through our own
 *    `/api/wearables/summary`, which holds the key.
 *  - **Every call can come back empty and that is not an error.** Coverage
 *    varies by provider and by how often somebody wears the thing. The caller
 *    gets an outcome it can show, never an exception it has to guess about.
 */

export type WearablesOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_configured'; reason: string }
  | { kind: 'auth'; reason: string }
  | { kind: 'not_linked'; reason: string }
  | { kind: 'unreachable'; reason: string };

interface Config {
  /** Our own proxy endpoints. Never the Open Wearables deployment itself. */
  summaryUrl: string;
  linkUrl: string;
  connectUrl: string;
}

function envConfig(): Config | null {
  const summaryUrl = process.env.EXPO_PUBLIC_OPEN_WEARABLES_SUMMARY_URL ?? '';
  if (!summaryUrl) return null;
  // One setting, three endpoints side by side: …/wearables/{summary,link,connect}.
  const dir = summaryUrl.replace(/\/summary\/?$/, '');
  return { summaryUrl, linkUrl: `${dir}/link`, connectUrl: `${dir}/connect` };
}

/**
 * The signed-in session, which is how the backend knows whose data to read.
 *
 * This used to be a user id the athlete typed in — and the backend read
 * whatever account that id named, with a key that reads everybody's. Now
 * there is no id on this side at all: the backend works out the account from
 * the session, and a request cannot name a different one.
 */
async function sessionHeader(): Promise<Record<string, string> | null> {
  const supa = getSupabase();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : undefined;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const SIGN_IN = 'Wearables need an account: sign in, so the backend knows whose data to read.';

async function post(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null } | { kind: 'auth' | 'unreachable'; reason: string }> {
  const auth = await sessionHeader();
  if (!auth) return { kind: 'auth', reason: SIGN_IN };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch (e) {
    return { kind: 'unreachable', reason: (e as Error).message || 'Could not reach the backend.' };
  }
}

function failure(status: number, json: Record<string, unknown> | null): Exclude<WearablesOutcome<never>, { kind: 'ok' }> {
  const error = json?.error;
  if (error === 'not_configured') return { kind: 'not_configured', reason: String(json?.detail ?? 'The backend has no Open Wearables settings.') };
  if (status === 401) return { kind: 'auth', reason: SIGN_IN };
  if (error === 'not_linked') return { kind: 'not_linked', reason: 'Set up wearables first, then connect a device.' };
  return { kind: 'unreachable', reason: `The backend answered ${status}.` };
}

export const wearables = {
  configured(): boolean {
    return envConfig() !== null;
  },

  /** Create this account's wearables profile. Safe to call more than once. */
  async link(): Promise<WearablesOutcome<{ created: boolean }>> {
    const config = envConfig();
    if (!config) return { kind: 'not_configured', reason: 'No Open Wearables deployment is set for this build.' };
    const r = await post(config.linkUrl, {});
    if ('kind' in r) return r;
    if (r.status === 200 || r.status === 201) return { kind: 'ok', data: { created: r.json?.created === true } };
    return failure(r.status, r.json);
  },

  /** The provider's sign-in page for this account, to open in a browser. */
  async connect(provider: string, redirectUri?: string): Promise<WearablesOutcome<{ authorizationUrl: string }>> {
    const config = envConfig();
    if (!config) return { kind: 'not_configured', reason: 'No Open Wearables deployment is set for this build.' };
    const r = await post(config.connectUrl, { provider, redirectUri });
    if ('kind' in r) return r;
    if (r.status === 200 && typeof r.json?.authorizationUrl === 'string') {
      return { kind: 'ok', data: { authorizationUrl: r.json.authorizationUrl } };
    }
    return failure(r.status, r.json);
  },

  async sleep(from: string, to: string): Promise<WearablesOutcome<NormalisedSleep[]>> {
    return this.fetchSummary<OwSleepSummary, NormalisedSleep[]>('sleep', from, to, normaliseSleep);
  },

  async activity(from: string, to: string): Promise<WearablesOutcome<NormalisedDay[]>> {
    return this.fetchSummary<OwActivitySummary, NormalisedDay[]>('activity', from, to, normaliseActivity);
  },

  async recovery(from: string, to: string): Promise<WearablesOutcome<(VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[]>> {
    return this.fetchSummary<OwRecoverySummary, (VitalsDay & { hrvKind: 'sdnn' | 'rmssd' | null })[]>(
      'recovery', from, to, normaliseRecovery,
    );
  },

  /**
   * One summary kind, already paged to the end by the proxy.
   *
   * Paging happens server-side rather than here: a year of daily rows is
   * several pages, and doing it on the phone means several round trips over
   * whatever connection the athlete has.
   */
  async fetchSummary<Row, Out>(
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
    const r = await post(config.summaryUrl, { kind, from, to });
    if ('kind' in r) return r;
    if (r.status !== 200) return failure(r.status, r.json);
    const rows = (r.json?.data as Row[] | undefined) ?? [];
    return { kind: 'ok', data: normalise(rows) };
  },
};
