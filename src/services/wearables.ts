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
  | { kind: 'unreachable'; reason: string };

interface Config {
  /** Our own proxy endpoint. Never the Open Wearables deployment itself. */
  summaryUrl: string;
}

function envConfig(): Config | null {
  const summaryUrl = process.env.EXPO_PUBLIC_OPEN_WEARABLES_SUMMARY_URL ?? '';
  return summaryUrl ? { summaryUrl } : null;
}

export const wearables = {
  configured(): boolean {
    return envConfig() !== null;
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
   * One summary kind, already paged to the end by the proxy.
   *
   * Paging happens server-side rather than here: a year of daily rows is
   * several pages, and doing it on the phone means several round trips over
   * whatever connection the athlete has.
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

    try {
      const response = await fetch(config.summaryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, userId, from, to }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        if (detail?.error === 'not_configured') {
          return { kind: 'not_configured', reason: detail.detail ?? 'The backend has no Open Wearables settings.' };
        }
        if (detail?.error === 'bad_user_id') {
          return { kind: 'auth', reason: 'That does not look like an Open Wearables user id. It is a UUID.' };
        }
        return { kind: 'unreachable', reason: detail?.detail ?? `The backend answered ${response.status}.` };
      }

      const body = (await response.json()) as { data?: Row[] };
      return { kind: 'ok', data: normalise(body.data ?? []) };
    } catch (e) {
      return { kind: 'unreachable', reason: (e as Error).message || 'Could not reach the backend.' };
    }
  },
};
