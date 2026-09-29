/**
 * Who is calling, and how much of what they claim to be we believe.
 *
 * The previous version of this had a hole big enough to bill money through.
 * The JWT secret was optional, and when it was absent the token was decoded
 * anyway and its claims used: the caller's `sub` became the rate-limit bucket
 * and the caller's `tier` decided whether they got five model calls a day or
 * a thousand. Both are attacker-chosen in an unsigned token. Anybody could
 * mint `{"sub": <random>, "tier": "pro"}`, skip the signature entirely, and
 * spend the operator's model budget without limit — a new `sub` per request
 * defeated even the free-tier bucket.
 *
 * So: claims are read only from a token whose signature verified. Without a
 * configured secret there is no verification available, and the correct
 * reading of an unverifiable token is that it tells us nothing. The caller is
 * anonymous and free, rate-limited on something they do not choose.
 *
 * `tier` deserves its own warning, which `TIER_CLAIM_WARNING` carries to the
 * operator: in Supabase, `user_metadata` is writable by the user it describes.
 * A `tier` claim populated from there is a self-service upgrade, signature or
 * no signature. It has to come from `app_metadata`, which only the service
 * role can write.
 */
import crypto from 'node:crypto';

export const ANONYMOUS = { id: 'anon', tier: 'free', verified: false };

export const TIER_CLAIM_WARNING =
  'A `tier` claim must come from app_metadata, never user_metadata: the latter is writable by the user it describes, so a tier taken from it is a self-service upgrade.';

export const NO_SECRET_WARNING =
  'SUPABASE_JWT_SECRET is not set. Tokens cannot be verified, so every request is treated as anonymous and free. Do not run like this in production: the alternative is trusting whatever a caller claims about themselves.';

/** Base64url without throwing on the malformed input this will certainly meet. */
function decodeSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Verify a JWT and return what it says, or null.
 *
 * Null means "do not trust this", which the caller must treat as anonymous
 * rather than as an error to fall through — an early version returned a
 * plausible-looking user object from the catch block, which meant a malformed
 * token was *more* trusted than a well-formed invalid one.
 */
export function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  const header = decodeSegment(encodedHeader);
  // Pinned rather than read from the token. `alg` is chosen by whoever sent
  // the token, and honouring "none" is the oldest JWT bug there is.
  if (!header || header.alg !== 'HS256') return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  // Length-checked first because timingSafeEqual throws on a length mismatch,
  // and a thrown comparison is a failed comparison that looks like a crash.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const payload = decodeSegment(encodedPayload);
  if (!payload) return null;

  // Expiry, which the previous version never looked at: a token leaked once
  // worked for ever.
  const seconds = Math.floor(now / 1000);
  if (typeof payload.exp === 'number' && seconds >= payload.exp) return null;
  if (typeof payload.nbf === 'number' && seconds < payload.nbf) return null;

  return payload;
}

/**
 * The caller, from a request.
 *
 * `fallbackId` is what identifies an unverified caller for rate limiting —
 * the connecting address, normally. It matters that it is not something the
 * caller picks: the whole point of the bucket is that it cannot be rotated.
 */
export function userFromRequest(req, { secret = process.env.SUPABASE_JWT_SECRET, now = Date.now() } = {}) {
  const header = req?.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const fallbackId = addressOf(req);

  if (!token) return { ...ANONYMOUS, id: fallbackId };

  const payload = verifyToken(token, secret, now);
  if (!payload) return { ...ANONYMOUS, id: fallbackId };

  return {
    id: typeof payload.sub === 'string' && payload.sub ? payload.sub : fallbackId,
    // Only ever 'pro' when the verified token says so exactly. Anything else,
    // including a missing claim, is free — the cheap default is the safe one.
    tier: payload.tier === 'pro' ? 'pro' : 'free',
    verified: true,
  };
}

/**
 * Something stable to bucket an anonymous caller on.
 *
 * X-Forwarded-For is only as trustworthy as the proxy that wrote it, and a
 * proxy *appends* to it: a caller who sends `X-Forwarded-For: 1.2.3.4`
 * arrives as "1.2.3.4, <their real address>". An earlier version took the
 * first entry — the one the caller wrote — so a different made-up address on
 * every request was a fresh free-tier bucket every time, which is the
 * rotating-bucket hole the JWT fix had just closed, reopened one header over.
 *
 * The address worth trusting is the one your own proxy added, which is
 * counted from the right: with one proxy in front it is the last entry.
 * How many proxies there are is a fact about the deployment that this code
 * cannot see, so it is configured — TRUST_PROXY_HOPS — and defaults to
 * zero, which ignores the header entirely. Wrong in the safe direction:
 * behind a proxy with no setting, anonymous callers share one bucket, which
 * is strict, instead of each choosing their own, which is free.
 */
export function addressOf(req, hops = Number(process.env.TRUST_PROXY_HOPS ?? 0)) {
  const trusted = Number.isInteger(hops) && hops > 0 ? hops : 0;
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (trusted > 0 && typeof forwarded === 'string' && forwarded.length > 0) {
    const chain = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    // The entry written by the outermost trusted proxy. If the chain is
    // shorter than the configured hops, the request did not come through
    // the proxies it claims to have, so fall through to the socket.
    const candidate = chain[chain.length - trusted];
    if (candidate) return `ip:${candidate}`;
  }
  const direct = req?.socket?.remoteAddress || req?.ip;
  return direct ? `ip:${direct}` : 'ip:unknown';
}
