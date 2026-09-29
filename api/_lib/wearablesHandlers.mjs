import { applyCors, readJson } from './cors.mjs';
import { insertWearableLink, ownWearableLink, verifyCaller } from './supabase.mjs';
import { PROVIDERS, authorizationUrl, createOwUser, owEnv } from './openWearables.mjs';

/**
 * The wearables endpoints, as factories so the tests can hand them a fake
 * network and environment.
 *
 * The rule all three follow: the wearables user is the one linked to the
 * *verified* caller, looked up under their own row-level security. Nothing
 * a caller sends can name a different one. The summary endpoint used to take
 * `userId` from the request body — from a text box in the app — and read
 * that user's health data with a key that reads everybody's.
 */

const KINDS = new Set(['sleep', 'activity', 'recovery']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Pages to follow before giving up, so a bad cursor cannot spin here. */
const MAX_PAGES = 40;

function preflight(req, res) {
  if (!applyCors(req, res)) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return false;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'post_only' });
    return false;
  }
  return true;
}

function configured(res, env) {
  const { base, apiKey } = owEnv(env);
  if (base && apiKey) return true;
  res.status(503).json({ error: 'not_configured', detail: 'OPEN_WEARABLES_URL and OPEN_WEARABLES_API_KEY must be set.' });
  return false;
}

/** Create the caller's wearables account and link it, once. */
export function makeLinkHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const deps = { env, fetchImpl };
  return async (req, res) => {
    if (!preflight(req, res) || !configured(res, env)) return;
    const caller = await verifyCaller(req, deps);
    if (!caller) return res.status(401).json({ error: 'sign_in_required' });
    try {
      if (await ownWearableLink(caller, deps)) return res.status(200).json({ linked: true, created: false });
      const owUserId = await createOwUser(deps);
      await insertWearableLink(caller.id, owUserId, deps);
      // The wearables id is not returned. The app has no use for it, and an
      // id that never leaves the server cannot be typed into anything.
      return res.status(201).json({ linked: true, created: true });
    } catch (e) {
      return res.status(e?.status === 503 ? 503 : 502).json({ error: 'link_failed' });
    }
  };
}

/** A provider's sign-in page, for the caller's own wearables account. */
export function makeConnectHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const deps = { env, fetchImpl };
  return async (req, res) => {
    if (!preflight(req, res) || !configured(res, env)) return;
    const caller = await verifyCaller(req, deps);
    if (!caller) return res.status(401).json({ error: 'sign_in_required' });
    const { provider, redirectUri } = readJson(req);
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: 'bad_provider' });
    const redirect = typeof redirectUri === 'string' && /^(forgefit|https):\/\//.test(redirectUri) ? redirectUri : undefined;
    try {
      const owUserId = await ownWearableLink(caller, deps);
      if (!owUserId) return res.status(409).json({ error: 'not_linked' });
      return res.status(200).json({ authorizationUrl: await authorizationUrl(owUserId, provider, redirect, deps) });
    } catch {
      return res.status(502).json({ error: 'connect_failed' });
    }
  };
}

/** Summaries for the caller's own wearables account. */
export function makeSummaryHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const deps = { env, fetchImpl };
  return async (req, res) => {
    if (!preflight(req, res) || !configured(res, env)) return;
    const caller = await verifyCaller(req, deps);
    if (!caller) return res.status(401).json({ error: 'sign_in_required' });

    // `userId` in the body, if an older app still sends one, is ignored.
    const { kind, from, to } = readJson(req);
    if (!KINDS.has(kind)) return res.status(400).json({ error: 'bad_kind' });
    if (typeof from !== 'string' || !DATE.test(from)) return res.status(400).json({ error: 'bad_from' });
    if (typeof to !== 'string' || !DATE.test(to)) return res.status(400).json({ error: 'bad_to' });
    if (from > to) return res.status(400).json({ error: 'backwards_window' });

    let owUserId;
    try {
      owUserId = await ownWearableLink(caller, deps);
    } catch {
      return res.status(502).json({ error: 'link_lookup_failed' });
    }
    if (!owUserId) return res.status(409).json({ error: 'not_linked' });

    const { base, apiKey } = owEnv(env);
    const rows = [];
    let cursor = null;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`${base}/api/v1/users/${owUserId}/summaries/${kind}`);
        url.searchParams.set('start_date', from);
        url.searchParams.set('end_date', to);
        if (cursor) url.searchParams.set('cursor', cursor);
        const upstream = await fetchImpl(url, {
          headers: { 'X-Open-Wearables-API-Key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!upstream.ok) {
          // Reported, not mirrored: a 401 from them is configuration here,
          // and passing it through would sign the *athlete* out of the app.
          return res.status(502).json({ error: 'upstream', status: upstream.status });
        }
        const body = await upstream.json();
        if (Array.isArray(body?.data)) rows.push(...body.data);
        cursor = body?.pagination?.next_cursor ?? null;
        if (!cursor || body?.pagination?.has_more === false) break;
      }
      // Paged to the end: the first page alone is the latest fortnight
      // presented as a year.
      return res.status(200).json({ data: rows });
    } catch {
      return res.status(502).json({ error: 'unreachable' });
    }
  };
}
