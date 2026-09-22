import { applyCors, readJson } from '../_lib/cors.mjs';

/**
 * Proxy a food lookup to USDA FoodData Central.
 *
 * FDC keys are free, but they are rate limited per key rather than per user:
 * an api.data.gov key allows a fixed number of requests an hour across
 * everyone using it. A key compiled into the app bundle would therefore be a
 * shared quota that any one user could exhaust for everybody, and — since
 * anyone can unzip an app — a key strangers could spend outright. So it lives
 * here.
 *
 * The proxy is deliberately narrow. It accepts a search phrase or an fdcId,
 * and nothing a caller sends can reach any other part of their API.
 */

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const TIMEOUT_MS = 8000;

const DATA_TYPES = new Set(['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']);
const MAX_PAGE_SIZE = 200;

/**
 * The nutrients the app logs, by FDC id.
 *
 * Not forwarded to FDC as its `nutrients` parameter: that one matches SR
 * *numbers* ("208"), and sending ids returns an empty `foodNutrients[]`.
 * Kept here only to document what the client reads.
 */

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'not_configured',
      detail: 'USDA_FDC_API_KEY must be set on this deployment. A free key comes from api.data.gov.',
    });
  }

  const body = readJson(req);

  // ---- One food by id -----------------------------------------------------
  if (body.fdcId != null) {
    const id = Number(body.fdcId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_fdc_id' });
    return forward(res, `${BASE}/food/${id}?api_key=${encodeURIComponent(apiKey)}`, { method: 'GET' });
  }

  // ---- Search -------------------------------------------------------------
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'bad_query' });
  if (query.length > 200) return res.status(400).json({ error: 'query_too_long' });

  const search = { query };

  if (Array.isArray(body.dataType)) {
    const clean = body.dataType.filter((d) => DATA_TYPES.has(d));
    if (clean.length) search.dataType = clean;
  }

  const pageSize = Number(body.pageSize);
  search.pageSize = Number.isFinite(pageSize) ? Math.min(Math.max(1, Math.trunc(pageSize)), MAX_PAGE_SIZE) : 25;

  const pageNumber = Number(body.pageNumber);
  search.pageNumber = Number.isFinite(pageNumber) ? Math.max(1, Math.trunc(pageNumber)) : 1;

  return forward(res, `${BASE}/foods/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(search),
  });
}

/**
 * Hand the upstream response back untouched.
 *
 * The shaping happens in the app, against `domain/usda`, so that the parsing
 * traps — two nutrient shapes, three energy ids, per-100 g branded values —
 * are covered by unit tests rather than living in an untested serverless
 * function.
 */
async function forward(res, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });

    // A 404 from `/food/{id}` is "no such food", which is an answer, not a
    // fault. Their other paths answer 200 with totalHits 0 instead.
    if (upstream.status === 404) return res.status(404).json({ error: 'not_found' });

    if (!upstream.ok) {
      // Their rate-limit response is the one worth naming: it is what a caller
      // sees when the key's hourly allowance is gone, and it is not a bug.
      const reason = upstream.status === 429 ? 'rate_limited' : 'upstream_error';
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: reason, status: upstream.status });
    }

    const data = await upstream.json();
    // Cached briefly at the edge: food composition does not change hour to
    // hour, and repeat searches are the common case while somebody types.
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).json(data);
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({ error: aborted ? 'timeout' : 'unreachable' });
  } finally {
    clearTimeout(timer);
  }
}
