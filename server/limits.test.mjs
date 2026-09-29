import test from 'node:test';
import assert from 'node:assert/strict';
import { BUDGETS, BURST, createLimiter } from './limits.mjs';

const clock = (start = 0) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};
const free = (id = 'u1') => ({ id, tier: 'free' });
const pro = (id = 'u1') => ({ id, tier: 'pro' });

test('every model route has a budget', () => {
  // The hole: four of five routes had no limit at all.
  for (const route of ['food', 'coach', 'workout', 'weekly', 'progress']) {
    assert.ok(BUDGETS[route], `${route} must be limited`);
    assert.ok(BUDGETS[route].free > 0 && BUDGETS[route].pro >= BUDGETS[route].free);
  }
});

test('refuses a route with no budget rather than letting it through', () => {
  assert.throws(() => createLimiter().check(free(), 'unknown-route'));
});

test('stops a free caller at the daily budget', () => {
  const c = clock();
  const lim = createLimiter({ now: c.now });
  for (let i = 0; i < BUDGETS.food.free; i++) {
    assert.equal(lim.check(free(), 'food').ok, true);
    c.advance(BURST.windowMs); // stay under the burst limit
  }
  const over = lim.check(free(), 'food');
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'daily');
  assert.ok(over.retryAfterS > 0);
});

test('gives pro its higher budget, but still a ceiling', () => {
  const c = clock();
  const lim = createLimiter({ now: c.now });
  let allowed = 0;
  for (let i = 0; i < BUDGETS.food.pro + 5; i++) {
    if (lim.check(pro(), 'food').ok) allowed++;
    c.advance(BURST.windowMs);
  }
  assert.equal(allowed, BUDGETS.food.pro);
});

test('keeps each route separate', () => {
  const c = clock();
  const lim = createLimiter({ now: c.now });
  for (let i = 0; i < BUDGETS.workout.free; i++) {
    lim.check(free(), 'workout');
    c.advance(BURST.windowMs);
  }
  assert.equal(lim.check(free(), 'workout').ok, false);
  assert.equal(lim.check(free(), 'coach').ok, true);
});

test('trips the burst limit across routes within a minute', () => {
  const lim = createLimiter({ now: () => 0 });
  const routes = ['coach', 'progress'];
  let ok = 0;
  for (let i = 0; i < BURST.max + 5; i++) if (lim.check(pro(), routes[i % 2]).ok) ok++;
  assert.equal(ok, BURST.max);
  assert.equal(lim.check(pro(), 'coach').reason, 'burst');
});

test('resets after the window', () => {
  const c = clock();
  const lim = createLimiter({ now: c.now });
  for (let i = 0; i < BUDGETS.workout.free; i++) {
    lim.check(free(), 'workout');
    c.advance(BURST.windowMs);
  }
  assert.equal(lim.check(free(), 'workout').ok, false);
  c.advance(BUDGETS.workout.windowMs);
  assert.equal(lim.check(free(), 'workout').ok, true);
});

test('forgets expired buckets instead of growing for ever', () => {
  // The leak: one bucket per address, never removed.
  const c = clock();
  const lim = createLimiter({ now: c.now, maxKeys: 10 });
  for (let i = 0; i < 5; i++) lim.take(`ip:${i}`, 5, 1000);
  c.advance(2000);
  for (let i = 5; i < 15; i++) lim.take(`ip:${i}`, 5, 1000);
  assert.ok(lim.size() <= 10, `size ${lim.size()} should stay within the ceiling`);
});

test('turns new callers away at the ceiling rather than growing without bound', () => {
  const lim = createLimiter({ now: () => 0, maxKeys: 3 });
  for (let i = 0; i < 3; i++) assert.equal(lim.take(`ip:${i}`, 5, 60_000).ok, true);
  assert.equal(lim.take('ip:new', 5, 60_000).ok, false);
  assert.equal(lim.size(), 3);
  // An existing caller is unaffected.
  assert.equal(lim.take('ip:0', 5, 60_000).ok, true);
});
