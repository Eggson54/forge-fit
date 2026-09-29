import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createJwks, userFromRequestAsync, verifyAnyToken } from './auth.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const NOW = Date.UTC(2026, 8, 29, 12);
const soon = Math.floor(NOW / 1000) + 3600;

const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ecJwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-1', alg: 'ES256' };
const rsaJwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-1', alg: 'RS256' };

function signEs(payload, kid = 'ec-1', key = ec.privateKey) {
  const h = b64({ alg: 'ES256', typ: 'JWT', kid });
  const p = b64(payload);
  // JWTs carry ECDSA signatures as raw r||s, not DER.
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${sig.toString('base64url')}`;
}
function signRs(payload, kid = 'rsa-1') {
  const h = b64({ alg: 'RS256', typ: 'JWT', kid });
  const p = b64(payload);
  return `${h}.${p}.${crypto.sign('sha256', Buffer.from(`${h}.${p}`), rsa.privateKey).toString('base64url')}`;
}
function signHs(payload, secret) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(payload);
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}

/** A JWKS endpoint that counts how often it is asked. */
function jwksServer(keys = [ecJwk, rsaJwk]) {
  let fetches = 0;
  let clock = NOW;
  const jwks = createJwks('https://proj.supabase.co/', {
    now: () => clock,
    fetchImpl: async (url) => {
      fetches += 1;
      assert.equal(String(url), 'https://proj.supabase.co/auth/v1/.well-known/jwks.json');
      return { ok: true, json: async () => ({ keys }) };
    },
  });
  return { jwks, fetches: () => fetches, advance: (ms) => (clock += ms) };
}

test('accepts a session signed with an ES256 project key', async () => {
  // Supabase's current key system. The old code treated all of these as anonymous.
  const { jwks } = jwksServer();
  const claims = await verifyAnyToken(signEs({ sub: 'u1', exp: soon }), { jwks, now: NOW });
  assert.equal(claims.sub, 'u1');
});

test('accepts RS256 as well', async () => {
  const { jwks } = jwksServer();
  assert.equal((await verifyAnyToken(signRs({ sub: 'u2', exp: soon }), { jwks, now: NOW })).sub, 'u2');
});

test('still accepts the older shared-secret sessions', async () => {
  assert.equal((await verifyAnyToken(signHs({ sub: 'u3', exp: soon }, 's3cret'), { secret: 's3cret', now: NOW })).sub, 'u3');
});

test('refuses a token signed with somebody else\'s key', async () => {
  const { jwks } = jwksServer();
  const stranger = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  assert.equal(await verifyAnyToken(signEs({ sub: 'u1', exp: soon }, 'ec-1', stranger.privateKey), { jwks, now: NOW }), null);
});

test('refuses a token whose claims were edited after signing', async () => {
  const { jwks } = jwksServer();
  const [h, , s] = signEs({ sub: 'u1', tier: 'free', exp: soon }).split('.');
  assert.equal(await verifyAnyToken(`${h}.${b64({ sub: 'u1', tier: 'pro', exp: soon })}.${s}`, { jwks, now: NOW }), null);
});

test('refuses a token that asks to be checked with the wrong kind of key', async () => {
  // An RS256 header naming the EC key: the key type must match the algorithm.
  const { jwks } = jwksServer();
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'ec-1' });
  const p = b64({ sub: 'u1', exp: soon });
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), rsa.privateKey).toString('base64url');
  assert.equal(await verifyAnyToken(`${h}.${p}.${sig}`, { jwks, now: NOW }), null);
});

test('refuses alg none, unknown algorithms, and a missing key id', async () => {
  const { jwks } = jwksServer();
  const p = b64({ sub: 'u1', exp: soon });
  assert.equal(await verifyAnyToken(`${b64({ alg: 'none' })}.${p}.`, { jwks, now: NOW }), null);
  assert.equal(await verifyAnyToken(`${b64({ alg: 'PS512', kid: 'ec-1' })}.${p}.x`, { jwks, now: NOW }), null);
  assert.equal(await verifyAnyToken(`${b64({ alg: 'ES256' })}.${p}.x`, { jwks, now: NOW }), null);
});

test('refuses an expired session', async () => {
  const { jwks } = jwksServer();
  assert.equal(await verifyAnyToken(signEs({ sub: 'u1', exp: Math.floor(NOW / 1000) - 1 }), { jwks, now: NOW }), null);
});

test('caches keys instead of fetching them on every request', async () => {
  const s = jwksServer();
  for (let i = 0; i < 5; i++) await verifyAnyToken(signEs({ sub: 'u1', exp: soon }), { jwks: s.jwks, now: NOW });
  assert.equal(s.fetches(), 1);
});

test('cannot be made to fetch keys in a loop by made-up key ids', async () => {
  const s = jwksServer();
  for (let i = 0; i < 20; i++) await verifyAnyToken(signEs({ sub: 'u1', exp: soon }, `made-up-${i}`), { jwks: s.jwks, now: NOW });
  assert.ok(s.fetches() <= 1, `fetched ${s.fetches()} times`);
});

test('picks up a rotated key once the throttle allows', async () => {
  const keys = [ecJwk];
  const s = jwksServer(keys);
  await verifyAnyToken(signEs({ sub: 'u1', exp: soon }), { jwks: s.jwks, now: NOW });
  keys.push(rsaJwk); // rotation: a new key appears
  s.advance(31_000);
  assert.equal((await verifyAnyToken(signRs({ sub: 'u2', exp: soon }), { jwks: s.jwks, now: NOW + 31_000 })).sub, 'u2');
});

test('a verified key with no user in it is nobody', async () => {
  // Supabase's anon and service keys are JWTs too. They identify no person.
  const { jwks } = jwksServer();
  const req = { headers: { authorization: `Bearer ${signEs({ role: 'anon', exp: soon })}` }, socket: { remoteAddress: '203.0.113.7' } };
  const u = await userFromRequestAsync(req, { jwks, now: NOW });
  assert.equal(u.verified, false);
  assert.equal(u.id, 'ip:203.0.113.7');
});

test('a verified session is the person it names, on the free tier unless it says pro', async () => {
  const { jwks } = jwksServer();
  const req = (t) => ({ headers: { authorization: `Bearer ${t}` }, socket: {} });
  assert.deepEqual(await userFromRequestAsync(req(signEs({ sub: 'u1', exp: soon })), { jwks, now: NOW }), { id: 'u1', tier: 'free', verified: true });
  assert.equal((await userFromRequestAsync(req(signEs({ sub: 'u1', tier: 'pro', exp: soon })), { jwks, now: NOW })).tier, 'pro');
});
