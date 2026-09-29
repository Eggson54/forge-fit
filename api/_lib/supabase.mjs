/**
 * Who is calling, and what is theirs — asked of Supabase, not decided here.
 *
 * Identity comes from Supabase Auth's own `/auth/v1/user`, the same check
 * the delete-account function uses. That works whatever signing keys the
 * project uses (the older shared secret or the newer asymmetric keys), and
 * a signed-out or revoked session fails it, which a local signature check
 * would not notice.
 *
 * A caller's own rows are read *with the caller's token*, so row-level
 * security decides what comes back. Even a bug in the code here cannot hand
 * one person another's row: the database would return nothing.
 */

export function supabaseEnv(env = process.env) {
  const url = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url, anonKey, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '' };
}

export function bearer(req) {
  const h = req?.headers?.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/** The verified caller, or null. Never throws for a bad token. */
export async function verifyCaller(req, { env = process.env, fetchImpl = fetch } = {}) {
  const token = bearer(req);
  const { url, anonKey } = supabaseEnv(env);
  if (!token || !url || !anonKey) return null;
  try {
    const res = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === 'string' && user.id ? { id: user.id, token } : null;
  } catch {
    return null;
  }
}

/** The caller's own wearables link, read under their own RLS. */
export async function ownWearableLink(caller, { env = process.env, fetchImpl = fetch } = {}) {
  const { url, anonKey } = supabaseEnv(env);
  const res = await fetchImpl(`${url}/rest/v1/wearable_links?select=ow_user_id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${caller.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw Object.assign(new Error('link lookup failed'), { status: res.status });
  const rows = await res.json();
  return Array.isArray(rows) && rows[0]?.ow_user_id ? rows[0].ow_user_id : null;
}

/**
 * Record a link. Server only: this is the one write the table allows, and it
 * needs the service role precisely because no client may make it.
 */
export async function insertWearableLink(userId, owUserId, { env = process.env, fetchImpl = fetch } = {}) {
  const { url, serviceKey } = supabaseEnv(env);
  if (!serviceKey) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY is not set'), { status: 503 });
  const res = await fetchImpl(`${url}/rest/v1/wearable_links`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ user_id: userId, ow_user_id: owUserId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw Object.assign(new Error('link insert failed'), { status: res.status });
}
