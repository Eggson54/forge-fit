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
  'Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is set. Tokens cannot be verified, so every request is treated as anonymous and free. Do not run like this in production: the alternative is trusting whatever a caller claims about themselves.';

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
 * Supabase's newer signing keys, fetched and cached.
 *
 * Projects created on Supabase's current key system sign sessions with an
 * asymmetric key (ES256, or RS256) rather than the shared secret, and publish
 * the public half at /auth/v1/.well-known/jwks.json — the same place
 * supabase-js's own getClaims() reads it. A server that only checks the
 * shared secret treats every one of those sessions as anonymous: nobody gets
 * a pro limit, and signed-in users share a bucket by address. Both kinds are
 * accepted now; the secret remains for projects still on it.
 *
 * Keys are cached, and refetched when a token names a key id not in the
 * cache (a rotation) — but at most every 30 seconds, so a stream of tokens
 * with made-up key ids cannot turn this server into a JWKS fetch loop.
 */
export function createJwks(supabaseUrl, { fetchImpl = fetch, ttlMs = 10 * 60_000, minRefetchMs = 30_000, now = () => Date.now() } = {}) {
  const url = `${String(supabaseUrl).replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  let keys = [];
  let fetchedAt = -Infinity;
  let inflight = null;

  async function refresh() {
    if (now() - fetchedAt < minRefetchMs) return;
    inflight ??= (async () => {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body?.keys)) keys = body.keys;
        }
      } catch {
        /* keep what we had */
      } finally {
        fetchedAt = now();
        inflight = null;
      }
    })();
    await inflight;
  }

  return {
    async key(kid) {
      if (now() - fetchedAt > ttlMs) await refresh();
      let jwk = keys.find((k) => k.kid === kid);
      if (!jwk) {
        await refresh();
        jwk = keys.find((k) => k.kid === kid);
      }
      return jwk ?? null;
    },
  };
}

const ASYMMETRIC = {
  ES256: { kty: 'EC', verify: (data, key, sig) => crypto.verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig) },
  RS256: { kty: 'RSA', verify: (data, key, sig) => crypto.verify('sha256', data, key, sig) },
};

/**
 * Verify a Supabase session token signed either way, and return its claims.
 *
 * Same contract as verifyToken: null means "do not trust this". The key type
 * must match the algorithm the token claims, or a token could ask to be
 * checked with the wrong kind of key.
 */
export async function verifyAnyToken(token, { secret, jwks, now = Date.now() } = {}) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodeSegment(parts[0]);
  if (!header) return null;

  if (header.alg === 'HS256') return verifyToken(token, secret, now);

  const scheme = ASYMMETRIC[header.alg];
  if (!scheme || !jwks || typeof header.kid !== 'string') return null;
  const jwk = await jwks.key(header.kid);
  if (!jwk || jwk.kty !== scheme.kty || (jwk.alg && jwk.alg !== header.alg)) return null;

  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    ok = scheme.verify(Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch {
    return null;
  }
  if (!ok) return null;

  const payload = decodeSegment(parts[1]);
  if (!payload) return null;
  const seconds = Math.floor(now / 1000);
  if (typeof payload.exp === 'number' && seconds >= payload.exp) return null;
  if (typeof payload.nbf === 'number' && seconds < payload.nbf) return null;
  return payload;
}

let defaultJwks = null;
function jwksFromEnv() {
  if (!process.env.SUPABASE_URL) return null;
  defaultJwks ??= createJwks(process.env.SUPABASE_URL);
  return defaultJwks;
}

/**
 * The caller, from a request, accepting either kind of Supabase key.
 *
 * A verified token without a `sub` — Supabase's own anon or service keys are
 * JWTs signed the same way — identifies nobody, so it is treated as
 * anonymous rather than as a signed-in person with no id.
 */
export async function userFromRequestAsync(req, {
  secret = process.env.SUPABASE_JWT_SECRET,
  jwks = jwksFromEnv(),
  now = Date.now(),
} = {}) {
  const header = req?.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const fallbackId = addressOf(req);
  if (!token) return { ...ANONYMOUS, id: fallbackId };

  const payload = await verifyAnyToken(token, { secret, jwks, now });
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return { ...ANONYMOUS, id: fallbackId };
  return { id: payload.sub, tier: payload.tier === 'pro' ? 'pro' : 'free', verified: true };
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
