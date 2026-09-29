/**
 * Rate limits, per caller and per route.
 *
 * Every route that calls a model is limited, because every one of them
 * spends money. The previous limiter guarded one route of five: the coach,
 * workout, weekly-review and progress routes had no limit at all, so the
 * JWT and forwarded-address fixes protected the food route and left four
 * doors open beside it.
 *
 * It also never forgot anything. Buckets were created per caller and never
 * removed, and anonymous callers are bucketed by address — so the map grew
 * with every address that ever connected, for as long as the process ran.
 * Expired buckets are now swept, and past a hard ceiling new callers are
 * turned away rather than the process being allowed to grow without bound:
 * a flood of fresh addresses is exactly when that ceiling matters.
 *
 * In memory, so the limits are per process and reset on restart. That is the
 * honest limit of this design: running several instances multiplies every
 * number below by the instance count, and a shared store (Redis, or a
 * Supabase table) is what fixes it.
 */

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * Per route, per day. Free numbers match what the app tells people on the
 * paywall; pro numbers are a ceiling on one person's daily spend, not a
 * quota anyone is expected to reach — a stolen pro token should cost a
 * bounded amount, not whatever the attacker's script can manage.
 */
export const BUDGETS = {
  food: { free: 5, pro: 100, windowMs: DAY },
  coach: { free: 20, pro: 200, windowMs: DAY },
  workout: { free: 3, pro: 30, windowMs: DAY },
  weekly: { free: 3, pro: 20, windowMs: DAY },
  progress: { free: 10, pro: 60, windowMs: DAY },
};

/** Across all routes, whatever the tier: no caller needs more than this. */
export const BURST = { max: 20, windowMs: MINUTE };

export function createLimiter({ now = () => Date.now(), maxKeys = 50_000 } = {}) {
  const buckets = new Map();

  const sweep = (t) => {
    for (const [key, bucket] of buckets) if (t >= bucket.reset) buckets.delete(key);
  };

  /** Count one request. Returns whether it is allowed, and when to retry. */
  function take(id, max, windowMs) {
    const t = now();
    let bucket = buckets.get(id);
    if (bucket && t >= bucket.reset) {
      buckets.delete(id);
      bucket = undefined;
    }
    if (!bucket) {
      if (buckets.size >= maxKeys) sweep(t);
      // Still full after sweeping: every bucket is live. Refusing a new
      // caller is better than growing without bound during the very flood
      // that filled it.
      if (buckets.size >= maxKeys) return { ok: false, retryAfterS: Math.ceil(windowMs / 1000) };
      bucket = { count: 0, reset: t + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    const ok = bucket.count <= max;
    return { ok, retryAfterS: ok ? 0 : Math.max(1, Math.ceil((bucket.reset - t) / 1000)) };
  }

  /**
   * Check a caller against the burst limit and the route's daily budget.
   *
   * The burst is taken first and counts even a request the budget refuses,
   * so hammering an exhausted route still trips the per-minute limit.
   */
  function check(user, route) {
    const budget = BUDGETS[route];
    if (!budget) throw new Error(`No budget for route "${route}"`);
    const burst = take(`${user.id}:burst`, BURST.max, BURST.windowMs);
    if (!burst.ok) return { ok: false, retryAfterS: burst.retryAfterS, reason: 'burst' };
    const max = user.tier === 'pro' ? budget.pro : budget.free;
    const daily = take(`${user.id}:${route}`, max, budget.windowMs);
    if (!daily.ok) return { ok: false, retryAfterS: daily.retryAfterS, reason: 'daily' };
    return { ok: true, retryAfterS: 0, reason: null };
  }

  return { take, check, size: () => buckets.size };
}
