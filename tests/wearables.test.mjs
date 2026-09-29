/**
 * The wearables endpoints, against a simulated Supabase and Open Wearables.
 *
 * The simulation is honest about row-level security: a PostgREST read
 * returns only the row belonging to the token's own user, exactly as the
 * policy in 0004_wearable_links.sql does. So these tests prove the handlers
 * rely on it — not that they happen to pass an id through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConnectHandler, makeLinkHandler, makeSummaryHandler } from '../api/_lib/wearablesHandlers.mjs';

const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OPEN_WEARABLES_URL: 'https://ow.example',
  OPEN_WEARABLES_API_KEY: 'master',
};

const ALICE = { token: 'alice-token', id: 'user-alice', ow: '11111111-1111-4111-8111-111111111111' };
const MALLORY = { token: 'mallory-token', id: 'user-mallory', ow: '22222222-2222-4222-8222-222222222222' };

function world({ links = { [ALICE.id]: ALICE.ow, [MALLORY.id]: MALLORY.ow } } = {}) {
  const sessions = { [ALICE.token]: ALICE.id, [MALLORY.token]: MALLORY.id };
  const requests = [];
  let created = 0;
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const auth = init.headers?.Authorization ?? '';
    requests.push({ url: url.toString(), method: init.method ?? 'GET', auth, body: init.body });

    if (url.pathname === '/auth/v1/user') {
      const id = sessions[auth.replace('Bearer ', '')];
      return id ? json(200, { id }) : json(401, { msg: 'invalid' });
    }
    if (url.pathname === '/rest/v1/wearable_links' && (init.method ?? 'GET') === 'GET') {
      // Row-level security: only the token's own row, whatever was asked.
      const id = sessions[auth.replace('Bearer ', '')];
      return json(200, id && links[id] ? [{ ow_user_id: links[id] }] : []);
    }
    if (url.pathname === '/rest/v1/wearable_links' && init.method === 'POST') {
      if (auth !== 'Bearer service') return json(403, { message: 'permission denied' });
      const row = JSON.parse(init.body);
      links[row.user_id] = row.ow_user_id;
      return json(201, null);
    }
    if (url.pathname === '/api/v1/users' && init.method === 'POST') {
      created += 1;
      return json(201, { id: `33333333-3333-4333-8333-00000000000${created}` });
    }
    const sum = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/summaries\/(\w+)$/);
    if (sum) {
      const cursor = url.searchParams.get('cursor');
      return cursor
        ? json(200, { data: [{ owner: sum[1], page: 2 }], pagination: { next_cursor: null, has_more: false } })
        : json(200, { data: [{ owner: sum[1], page: 1 }], pagination: { next_cursor: 'c2', has_more: true } });
    }
    const auth2 = url.pathname.match(/^\/api\/v1\/oauth\/(\w+)\/authorize$/);
    if (auth2) return json(200, { authorization_url: `https://${auth2[1]}.example/auth?u=${url.searchParams.get('user_id')}`, state: 's' });
    return json(404, {});
  };
  return { fetchImpl, requests, links, created: () => created };
}

function call(handler, { token, body = {}, method = 'POST' } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; },
      end() { resolve({ status: this.statusCode, body: null }); return this; },
    };
    const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
    handler(req, res);
  });
}

const WINDOW = { kind: 'sleep', from: '2026-09-01', to: '2026-09-28' };

test('refuses an unsigned caller', async () => {
  const w = world();
  const h = makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl });
  assert.equal((await call(h, { body: WINDOW })).status, 401);
  assert.equal((await call(h, { token: 'forged', body: WINDOW })).status, 401);
});

test('never reads another person\'s data, whatever id the request names', async () => {
  // The leak: the id came from the request body, from a text box in the app.
  const w = world();
  const h = makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl });
  const res = await call(h, { token: MALLORY.token, body: { ...WINDOW, userId: ALICE.ow } });
  assert.equal(res.status, 200);
  const upstream = w.requests.filter((r) => r.url.includes('/summaries/'));
  assert.ok(upstream.length > 0);
  for (const r of upstream) {
    assert.ok(r.url.includes(MALLORY.ow), 'must read the caller\'s own account');
    assert.ok(!r.url.includes(ALICE.ow), 'must never touch the id the request named');
  }
  assert.ok(res.body.data.every((row) => row.owner === MALLORY.ow));
});

test('says "not linked" rather than guessing an account', async () => {
  const w = world({ links: {} });
  const h = makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl });
  const res = await call(h, { token: MALLORY.token, body: { ...WINDOW, userId: ALICE.ow } });
  assert.equal(res.status, 409);
  assert.equal(w.requests.filter((r) => r.url.includes('/summaries/')).length, 0);
});

test('reads the link with the caller\'s own token, so the database decides', async () => {
  const w = world();
  const h = makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl });
  await call(h, { token: ALICE.token, body: WINDOW });
  const read = w.requests.find((r) => r.url.includes('/rest/v1/wearable_links'));
  assert.equal(read.auth, `Bearer ${ALICE.token}`);
  assert.ok(!w.requests.some((r) => r.auth === 'Bearer service'), 'the service role is never used to read');
});

test('pages to the end before answering', async () => {
  const w = world();
  const res = await call(makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl }), { token: ALICE.token, body: WINDOW });
  assert.deepEqual(res.body.data.map((r) => r.page), [1, 2]);
});

test('checks the window', async () => {
  const w = world();
  const h = makeSummaryHandler({ env: ENV, fetchImpl: w.fetchImpl });
  assert.equal((await call(h, { token: ALICE.token, body: { ...WINDOW, kind: 'dna' } })).status, 400);
  assert.equal((await call(h, { token: ALICE.token, body: { ...WINDOW, from: '2026-10-01' } })).status, 400);
});

test('linking creates one account, once, without sending anything about the person', async () => {
  const w = world({ links: {} });
  const h = makeLinkHandler({ env: ENV, fetchImpl: w.fetchImpl });
  const first = await call(h, { token: ALICE.token });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { linked: true, created: true });
  const create = w.requests.find((r) => r.url.endsWith('/api/v1/users'));
  assert.equal(create.body, '{}');
  const again = await call(h, { token: ALICE.token });
  assert.deepEqual(again.body, { linked: true, created: false });
  assert.equal(w.created(), 1);
});

test('linking never hands the wearables id back to the app', async () => {
  const w = world({ links: {} });
  const res = await call(makeLinkHandler({ env: ENV, fetchImpl: w.fetchImpl }), { token: ALICE.token });
  assert.ok(!JSON.stringify(res.body).includes('3333'));
});

test('the link is written with the service role, which no client has', async () => {
  const w = world({ links: {} });
  await call(makeLinkHandler({ env: ENV, fetchImpl: w.fetchImpl }), { token: ALICE.token });
  const insert = w.requests.find((r) => r.url.includes('/rest/v1/wearable_links') && r.method === 'POST');
  assert.equal(insert.auth, 'Bearer service');
  assert.equal(JSON.parse(insert.body).user_id, ALICE.id);
});

test('connecting uses the caller\'s own account and a known provider', async () => {
  const w = world();
  const h = makeConnectHandler({ env: ENV, fetchImpl: w.fetchImpl });
  assert.equal((await call(h, { token: ALICE.token, body: { provider: 'myspace' } })).status, 400);
  const res = await call(h, { token: MALLORY.token, body: { provider: 'garmin', userId: ALICE.ow } });
  assert.equal(res.status, 200);
  assert.match(res.body.authorizationUrl, new RegExp(MALLORY.ow));
  assert.doesNotMatch(res.body.authorizationUrl, new RegExp(ALICE.ow));
});

test('connecting before linking says so', async () => {
  const w = world({ links: {} });
  const res = await call(makeConnectHandler({ env: ENV, fetchImpl: w.fetchImpl }), { token: ALICE.token, body: { provider: 'garmin' } });
  assert.equal(res.status, 409);
});

test('says it is not configured rather than failing obscurely', async () => {
  const w = world();
  const res = await call(makeSummaryHandler({ env: { ...ENV, OPEN_WEARABLES_API_KEY: '' }, fetchImpl: w.fetchImpl }), { token: ALICE.token, body: WINDOW });
  assert.equal(res.status, 503);
});
