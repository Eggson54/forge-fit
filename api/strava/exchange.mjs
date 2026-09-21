import { applyCors, readJson, stravaToken } from '../_lib/cors.mjs';

/**
 * Authorization code -> tokens.
 *
 * Returns only what the app needs. The refresh token has to go back (the app
 * is the only thing that knows which user it belongs to), but the scope list
 * and the athlete's whole Strava profile do not, so they are trimmed here
 * rather than stored on a device.
 */
export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const { code } = readJson(req);
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing authorization code.' });
  }

  try {
    const data = await stravaToken({ code, grant_type: 'authorization_code' });
    return res.status(200).json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athlete: data.athlete
        ? {
            id: data.athlete.id,
            firstName: data.athlete.firstname ?? null,
            username: data.athlete.username ?? null,
          }
        : null,
    });
  } catch (e) {
    return res.status(e.status ?? 502).json({ error: e.message });
  }
}
