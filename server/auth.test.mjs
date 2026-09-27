/**
 * Tests for the backend's auth module.
 *
 * Run by `node --test`, not by Jest. Jest compiles everything it loads to
 * CommonJS, which a `.mjs` file cannot be, and every way around that ends in
 * either a second copy of this module or a dynamic import the Jest sandbox
 * refuses. Security code with two copies eventually has two behaviours, so
 * the test moved to the runner that can load the real file instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ANONYMOUS, addressOf, userFromRequest, verifyToken } from './auth.mjs';

const SECRET = 'a-test-signing-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(payload, secret = SECRET, header = { alg: 'HS256', typ: 'JWT' }) {
  const h = b64(header);
  const p = b64(payload);
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

const req = (token, headers = {}) => ({
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  socket: { remoteAddress: '203.0.113.7' },
});

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const soon = Math.floor(NOW / 1000) + 3600;

test('accepts a correctly signed token', () => {
  assert.equal(verifyToken(sign({ sub: 'user-1', exp: soon }), SECRET, NOW).sub, 'user-1');
});

test('refuses a token signed with a different secret', () => {
  assert.equal(verifyToken(sign({ sub: 'user-1', exp: soon }, 'wrong'), SECRET, NOW), null);
});

test('refuses a token whose payload was edited after signing', () => {
  const token = sign({ sub: 'user-1', tier: 'free', exp: soon });
  const [h, , s] = token.split('.');
  const tampered = `${h}.${b64({ sub: 'user-1', tier: 'pro', exp: soon })}.${s}`;
  assert.equal(verifyToken(tampered, SECRET, NOW), null);
});

test('refuses the alg=none trick', () => {
  // The oldest JWT bug there is: the token tells you how to check it.
  const h = b64({ alg: 'none', typ: 'JWT' });
  const p = b64({ sub: 'attacker', tier: 'pro' });
  assert.equal(verifyToken(`${h}.${p}.`, SECRET, NOW), null);
});

test('refuses an expired token', () => {
  // A token leaked once used to work for ever, because exp was never read.
  assert.equal(verifyToken(sign({ sub: 'u', exp: Math.floor(NOW / 1000) - 1 }), SECRET, NOW), null);
});

test('refuses a token that is not valid yet', () => {
  assert.equal(verifyToken(sign({ sub: 'u', nbf: Math.floor(NOW / 1000) + 60, exp: soon }), SECRET, NOW), null);
});

test('refuses everything when no secret is configured', () => {
  // Without a secret there is no verification available, and the correct
  // reading of an unverifiable token is that it tells you nothing.
  assert.equal(verifyToken(sign({ sub: 'u', exp: soon }), '', NOW), null);
  assert.equal(verifyToken(sign({ sub: 'u', exp: soon }), undefined, NOW), null);
});

test('refuses malformed input without throwing', () => {
  for (const bad of ['', 'not.a.token', 'a.b', 'a.b.c.d', '....', null, undefined, 42]) {
    assert.equal(verifyToken(bad, SECRET, NOW), null);
  }
});

test('reads a verified token', () => {
  const u = userFromRequest(req(sign({ sub: 'user-1', tier: 'pro', exp: soon })), { secret: SECRET, now: NOW });
  assert.deepEqual(u, { id: 'user-1', tier: 'pro', verified: true });
});

test('gives an unverifiable caller nothing they asked for', () => {
  // The hole this module exists to close: an unsigned token used to supply
  // both the rate-limit bucket and the tier, so anybody could mint
  // {"sub": <random>, "tier": "pro"} and spend the operator's model budget
  // without limit.
  const forged = `${b64({ alg: 'HS256' })}.${b64({ sub: 'whoever', tier: 'pro' })}.nonsense`;
  const u = userFromRequest(req(forged), { secret: SECRET, now: NOW });
  assert.equal(u.tier, 'free');
  assert.equal(u.verified, false);
  assert.equal(u.id, 'ip:203.0.113.7');
});

test('buckets an unverified caller on something they cannot rotate', () => {
  // A new `sub` per request defeated even the free-tier limit.
  const a = userFromRequest(req(`${b64({ alg: 'HS256' })}.${b64({ sub: 'one' })}.x`), { secret: SECRET, now: NOW });
  const b = userFromRequest(req(`${b64({ alg: 'HS256' })}.${b64({ sub: 'two' })}.x`), { secret: SECRET, now: NOW });
  assert.equal(a.id, b.id);
});

test('treats every caller as anonymous when no secret is configured', () => {
  const u = userFromRequest(req(sign({ sub: 'user-1', tier: 'pro', exp: soon })), { secret: '', now: NOW });
  assert.deepEqual(u, { ...ANONYMOUS, id: 'ip:203.0.113.7' });
});

test('is free for a verified token claiming anything other than pro', () => {
  // The cheap default is the safe one.
  for (const tier of [undefined, 'PRO', 'premium', 'admin', true, 1]) {
    const u = userFromRequest(req(sign({ sub: 'u', tier, exp: soon })), { secret: SECRET, now: NOW });
    assert.equal(u.tier, 'free', `tier ${String(tier)} must not be pro`);
  }
});

test('handles a request with no token at all', () => {
  assert.deepEqual(userFromRequest(req(), { secret: SECRET, now: NOW }), { ...ANONYMOUS, id: 'ip:203.0.113.7' });
});

test('ignores an Authorization header that is not a Bearer token', () => {
  const u = userFromRequest({ headers: { authorization: 'Basic abc' }, socket: {} }, { secret: SECRET, now: NOW });
  assert.equal(u.verified, false);
});

test('buckets on the client end of a forwarding chain', () => {
  assert.equal(addressOf({ headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' } }), 'ip:198.51.100.9');
});

test('falls back to the socket, then to something bucketable', () => {
  assert.equal(addressOf({ headers: {}, socket: { remoteAddress: '203.0.113.7' } }), 'ip:203.0.113.7');
  assert.equal(addressOf({ headers: {} }), 'ip:unknown');
  assert.equal(addressOf(undefined), 'ip:unknown');
});
