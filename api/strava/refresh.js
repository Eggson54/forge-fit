import { applyCors, readJson, stravaToken } from '../_lib/cors.js';

/**
 * Refresh token -> new tokens.
 *
 * Strava rotates refresh tokens, so the response can carry a *different*
 * refresh token from the one sent. Storing the old one after a refresh is the
 * classic way to get silently signed out a few hours later, so the app is
 * handed both back every time and always overwrites.
 */
export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const { refreshToken } = readJson(req);
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'Missing refresh token.' });
  }

  try {
    const data = await stravaToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });
    return res.status(200).json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    });
  } catch (e) {
    return res.status(e.status ?? 502).json({ error: e.message });
  }
}
