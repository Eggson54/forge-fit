import { applyCors, readJson } from '../_lib/cors.mjs';

/**
 * Mint a user-scoped Open Wearables token.
 *
 * Exists for the same reason `/api/strava/exchange` does: the credential
 * that proves this app is this app must never be in the app. Open Wearables
 * issues short-lived, user-scoped JWTs in exchange for an app_id and
 * app_secret, and the secret stays here.
 *
 * The app sends only the user it wants a token for. This endpoint holds the
 * secret, calls the service, and returns the JWT — which is scoped to that
 * one user's data and expires in an hour, so a leaked one is worth far less
 * than the secret that produced it.
 */
export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const base = process.env.OPEN_WEARABLES_URL;
  const appId = process.env.OPEN_WEARABLES_APP_ID;
  const appSecret = process.env.OPEN_WEARABLES_APP_SECRET;

  if (!base || !appId || !appSecret) {
    // Deliberately explicit: a 503 with a reason is debuggable, a generic 500
    // sends somebody hunting through the app for a bug that is in a env var.
    res.status(503).json({
      error: 'not_configured',
      detail: 'OPEN_WEARABLES_URL, OPEN_WEARABLES_APP_ID and OPEN_WEARABLES_APP_SECRET must be set on this deployment.',
    });
    return;
  }

  const { userId } = readJson(req);

  // A UUID, because that is what their API takes, and because refusing
  // anything else here stops this endpoint being a way to probe the service.
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    res.status(400).json({ error: 'bad_user_id' });
    return;
  }

  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/api/v1/users/${userId}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });

    const text = await response.text();
    if (!response.ok) {
      // Their message is passed through but the status is not: a 401 from
      // them is not a 401 from us, and returning one would make the app think
      // the *user* is unauthenticated and sign them out.
      res.status(502).json({ error: 'upstream', status: response.status, detail: text.slice(0, 500) });
      return;
    }

    const token = safeParse(text);
    if (!token?.access_token) {
      res.status(502).json({ error: 'no_token' });
      return;
    }

    // Only the parts the app needs. The refresh token stays out of the
    // response: a mobile client that cannot keep a secret cannot keep that
    // one either, and asking this endpoint again is cheap.
    res.status(200).json({
      accessToken: token.access_token,
      tokenType: token.token_type ?? 'bearer',
      expiresIn: token.expires_in ?? 3600,
    });
  } catch (e) {
    res.status(502).json({ error: 'unreachable', detail: String(e?.message ?? e).slice(0, 200) });
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
