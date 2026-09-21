/**
 * The app talks to these routes from a native runtime and, in the browser
 * preview, from the deployed origin. Allowing everything would let any page
 * on the internet spend this server's Strava rate limit, so the allowlist is
 * explicit and an unknown origin simply gets no CORS headers back.
 */
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function applyCors(req, res) {
  const origin = req.headers.origin;
  // A native app sends no Origin at all; that is not something to block.
  if (!origin) return true;
  if (ALLOWED.length === 0 || ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return true;
  }
  return false;
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Strava's token endpoint, called with the client secret.
 *
 * This is the whole reason a server exists in this flow. The secret cannot go
 * in the app — anyone can unzip an IPA — so the app sends the short-lived
 * authorization code here and gets tokens back.
 */
export async function stravaToken(params) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('Strava is not configured on the server.');
    err.status = 503;
    throw err;
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Strava rejected the request.');
    err.status = res.status;
    throw err;
  }
  return data;
}
