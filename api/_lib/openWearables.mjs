/**
 * Calls to an Open Wearables deployment, with the master key.
 *
 * That key reads and writes every user on the deployment, which is why no
 * function here takes a user id from a request. Callers pass the id they
 * looked up for the verified caller (see supabase.mjs), and nothing else.
 */

/**
 * Providers that connect through OAuth, read from the Open Wearables source
 * (each has an oauth module). Apple Health, Health Connect and Samsung are
 * SDK-based and connect on the phone instead, so they are not offered here.
 * Strava is left out too: this app already connects to it directly.
 */
export const PROVIDERS = new Set(['garmin', 'whoop', 'oura', 'polar', 'suunto', 'fitbit', 'withings', 'ultrahuman', 'google_health', 'sensorbio']);

export function owEnv(env = process.env) {
  return { base: (env.OPEN_WEARABLES_URL || '').replace(/\/+$/, ''), apiKey: env.OPEN_WEARABLES_API_KEY || '' };
}

const headers = (apiKey) => ({ 'X-Open-Wearables-API-Key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json' });

/**
 * Create a wearables user for a ForgeFit account.
 *
 * Sends nothing about the person: no name, no email. The link lives in
 * ForgeFit's own table, so the wearables deployment needs no way to tell
 * who anybody is.
 */
export async function createOwUser({ env = process.env, fetchImpl = fetch } = {}) {
  const { base, apiKey } = owEnv(env);
  const res = await fetchImpl(`${base}/api/v1/users`, {
    method: 'POST',
    headers: headers(apiKey),
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw Object.assign(new Error('could not create wearables user'), { status: res.status });
  const user = await res.json();
  if (typeof user?.id !== 'string') throw new Error('wearables user has no id');
  return user.id;
}

export async function authorizationUrl(owUserId, provider, redirectUri, { env = process.env, fetchImpl = fetch } = {}) {
  const { base, apiKey } = owEnv(env);
  const url = new URL(`${base}/api/v1/oauth/${provider}/authorize`);
  url.searchParams.set('user_id', owUserId);
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri);
  const res = await fetchImpl(url, { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw Object.assign(new Error('could not start connection'), { status: res.status });
  const body = await res.json();
  if (typeof body?.authorization_url !== 'string') throw new Error('no authorization url');
  return body.authorization_url;
}

/** Delete a wearables user. A 404 means it is already gone, which is success. */
export async function deleteOwUser(owUserId, { env = process.env, fetchImpl = fetch } = {}) {
  const { base, apiKey } = owEnv(env);
  const res = await fetchImpl(`${base}/api/v1/users/${owUserId}`, {
    method: 'DELETE',
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 404) throw Object.assign(new Error('could not delete wearables user'), { status: res.status });
}
