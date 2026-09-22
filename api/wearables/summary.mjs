import { applyCors, readJson } from '../_lib/cors.mjs';

/**
 * Proxy a summary read to an Open Wearables deployment.
 *
 * This exists because of a detail in their auth that is easy to miss and
 * expensive to get wrong. Their SDK endpoint mints a user-scoped JWT, and it
 * looks like the thing a mobile app should use — but the summary endpoints
 * depend on `ApiKeyDep`, and `get_current_developer_optional` returns None
 * for any token carrying `scope: "sdk"`. So an SDK token is refused on
 * exactly the routes that hold the data, and the only credential those
 * routes accept is the master API key.
 *
 * That key grants every user's data on the deployment. It must never be in a
 * mobile bundle, so the app asks this endpoint instead and the key stays
 * here. The app sends a user id and a window; nothing it sends can widen the
 * scope of what comes back.
 */

const KINDS = new Set(['sleep', 'activity', 'recovery']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pages to follow before giving up, so a bad cursor cannot spin here. */
const MAX_PAGES = 40;

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const base = process.env.OPEN_WEARABLES_URL;
  const apiKey = process.env.OPEN_WEARABLES_API_KEY;
  if (!base || !apiKey) {
    return res.status(503).json({
      error: 'not_configured',
      detail: 'OPEN_WEARABLES_URL and OPEN_WEARABLES_API_KEY must be set on this deployment.',
    });
  }

  const { kind, userId, from, to } = readJson(req);

  if (!KINDS.has(kind)) return res.status(400).json({ error: 'bad_kind' });
  if (typeof userId !== 'string' || !UUID.test(userId)) return res.status(400).json({ error: 'bad_user_id' });
  if (typeof from !== 'string' || !DATE.test(from)) return res.status(400).json({ error: 'bad_from' });
  if (typeof to !== 'string' || !DATE.test(to)) return res.status(400).json({ error: 'bad_to' });
  if (from > to) return res.status(400).json({ error: 'backwards_window' });

  const root = base.replace(/\/+$/, '');
  const rows = [];
  let cursor = null;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${root}/api/v1/users/${userId}/summaries/${kind}`);
      url.searchParams.set('start_date', from);
      url.searchParams.set('end_date', to);
      if (cursor) url.searchParams.set('cursor', cursor);

      const upstream = await fetch(url, {
        headers: { 'X-Open-Wearables-API-Key': apiKey, Accept: 'application/json' },
      });

      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 300);
        // Their status is reported, not mirrored. A 401 from them is a
        // configuration problem here; passing it through would make the app
        // think the *user* is signed out and log them out.
        return res.status(502).json({ error: 'upstream', status: upstream.status, detail });
      }

      const body = await upstream.json();
      if (Array.isArray(body?.data)) rows.push(...body.data);

      cursor = body?.pagination?.next_cursor ?? null;
      if (!cursor || body?.pagination?.has_more === false) break;
    }

    // Paged to the end before answering. Returning the first page would give
    // somebody the most recent fortnight and call it a year — the kind of
    // wrong that looks right until a chart is compared with the source.
    return res.status(200).json({ data: rows });
  } catch (e) {
    return res.status(502).json({ error: 'unreachable', detail: String(e?.message ?? e).slice(0, 200) });
  }
}
