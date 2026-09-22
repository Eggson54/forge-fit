import {
  rankResults,
  readFood,
  readSearch,
  searchBody,
  type UsdaFood,
  type UsdaFoodResult,
  type UsdaSearchOptions,
  type UsdaSearchResponse,
} from '../domain/usda';

/**
 * Searching USDA FoodData Central.
 *
 * Unlike Open Food Facts, FDC needs a key, and that key is rate limited per
 * key rather than per user — so it sits on the server and the app calls
 * `/api/food/usda`. The app never sees it and cannot leak it.
 *
 * Like every other lookup in this app, failure is a value rather than an
 * exception. The athlete always has the bundled library and a manual entry
 * to fall back on, and a search that cannot reach the internet should say so
 * on the screen rather than throw into a render.
 */

const TIMEOUT_MS = 8000;

export type UsdaOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_configured'; reason: string }
  | { kind: 'rate_limited'; reason: string }
  | { kind: 'not_found' }
  | { kind: 'unreachable'; reason: string };

/**
 * Searches already answered this session, keyed by the exact request.
 *
 * Search runs as the athlete types. Without this, backspacing one character
 * and retyping it spends two more requests out of an hourly allowance shared
 * by every user of the deployment.
 */
const cache = new Map<string, UsdaFoodResult[]>();

/** Bounded so a long session cannot grow it without limit. */
const MAX_CACHE = 80;

function remember(key: string, value: UsdaFoodResult[]): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export const usdaFoods = {
  /** The proxy endpoint. Blank means this build has no server configured. */
  url(): string {
    return process.env.EXPO_PUBLIC_USDA_FOOD_URL ?? '';
  },

  enabled(): boolean {
    return this.url().trim().length > 0;
  },

  forget(): void {
    cache.clear();
  },

  async search(query: string, options: UsdaSearchOptions = {}): Promise<UsdaOutcome<UsdaFoodResult[]>> {
    const q = query.trim();
    if (q.length < 2) return { kind: 'ok', data: [] };

    const body = searchBody(q, options);
    const key = JSON.stringify(body);

    const cached = cache.get(key);
    if (cached) return { kind: 'ok', data: cached };

    const outcome = await post<UsdaSearchResponse>(this.url(), body);
    if (outcome.kind !== 'ok') return outcome;

    const results = rankResults(readSearch(outcome.data));
    remember(key, results);
    return { kind: 'ok', data: results };
  },

  /**
   * One food's full nutrient profile.
   *
   * Worth calling when a search hit is missing macros: their search response
   * carries a *preview* of nutrients that is explicitly not guaranteed
   * complete, so an incomplete hit is often complete in detail.
   */
  async detail(fdcId: number): Promise<UsdaOutcome<UsdaFoodResult>> {
    const outcome = await post<UsdaFood>(this.url(), { fdcId });
    if (outcome.kind !== 'ok') return outcome;

    const food = readFood(outcome.data);
    if (!food) return { kind: 'not_found' };
    return { kind: 'ok', data: food };
  },
};

async function post<T>(url: string, body: unknown): Promise<UsdaOutcome<T>> {
  if (!url.trim()) {
    return {
      kind: 'not_configured',
      reason: 'No food server is configured for this build, so USDA search is off. The bundled library still works.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 404) return { kind: 'not_found' };

    if (response.status === 429) {
      return {
        kind: 'rate_limited',
        reason: 'USDA is rate limiting this server right now. Try again shortly, or type the food in.',
      };
    }

    if (response.status === 503) {
      return {
        kind: 'not_configured',
        reason: 'The server has no USDA key set. The bundled library and barcode scanning still work.',
      };
    }

    if (!response.ok) {
      return { kind: 'unreachable', reason: `The food server answered ${response.status}.` };
    }

    return { kind: 'ok', data: (await response.json()) as T };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      kind: 'unreachable',
      reason: aborted ? 'The food server did not answer in time.' : 'Could not reach the food server.',
    };
  } finally {
    clearTimeout(timer);
  }
}
