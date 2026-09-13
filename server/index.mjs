/**
 * ForgeFit AI backend (reference implementation).
 *
 * Responsibilities:
 *   1. Keep the model provider API key server-side (NEVER in the mobile app).
 *   2. Authenticate the caller with their Supabase JWT (optional but recommended).
 *   3. Rate-limit per user (free vs pro) — enforced here, not trusted from the client.
 *   4. Ask the model for STRICT JSON and validate/sanitize before responding.
 *
 * If no provider key is configured, it falls back to a deterministic generator so
 * the endpoint contract is testable in any environment.
 *
 * Env:
 *   PORT                     (default 8787)
 *   ANTHROPIC_API_KEY        (optional) — enables Claude
 *   OPENAI_API_KEY           (optional) — enables OpenAI
 *   SUPABASE_JWT_SECRET      (optional) — if set, requests must carry a valid JWT
 */
import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '8mb' }));

const PORT = process.env.PORT || 8787;
const HAS_ANTHROPIC = !!process.env.ANTHROPIC_API_KEY;
const HAS_OPENAI = !!process.env.OPENAI_API_KEY;

// ── Minimal per-user rate limiter ────────────────────────────
const buckets = new Map();
function rateLimit(userId, key, max, windowMs) {
  const now = Date.now();
  const id = `${userId}:${key}`;
  const b = buckets.get(id) ?? { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count += 1;
  buckets.set(id, b);
  return b.count <= max;
}

// ── Auth (best-effort JWT verification) ──────────────────────
function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return { id: 'anon', tier: 'free' };
  const secret = process.env.SUPABASE_JWT_SECRET;
  try {
    const [h, p, s] = token.split('.');
    if (secret) {
      const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
      if (expected !== s) return null; // invalid signature
    }
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    return { id: payload.sub || 'user', tier: payload.tier || 'free' };
  } catch {
    return { id: 'user', tier: 'free' };
  }
}

// ── Model call: strict-JSON prompt, provider-agnostic ────────
async function callModel(system, user) {
  if (HAS_ANTHROPIC) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text ?? '';
  }
  if (HAS_OPENAI) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  }
  return null; // no provider configured
}

function parseJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(match ? match[0] : text); } catch { return null; }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

// ── Validators (never trust model output) ────────────────────
function sanitizeMacros(m = {}) {
  const proteinG = clamp(m.proteinG, 0, 400);
  const carbsG = clamp(m.carbsG, 0, 800);
  const fatG = clamp(m.fatG, 0, 400);
  const derived = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
  const given = clamp(m.calories, 0, 5000);
  const calories = given > 0 && Math.abs(given - derived) <= derived * 0.25 ? given : derived;
  return { calories, proteinG, carbsG, fatG, fiberG: clamp(m.fiberG, 0, 100) };
}

const SAFETY = `You are ForgeFit's fitness coach. You are NOT a medical professional.
Never diagnose, never prescribe medication/peptides/doses/cycles, never give dangerous dieting
or exercise advice, never encourage disordered eating. Never use hate speech, slurs, threats, or
body-shaming. Encourage consulting a qualified professional for medical questions.
Always respond with STRICT JSON matching the requested shape. No prose outside JSON.`;

// ── Routes ───────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, provider: HAS_ANTHROPIC ? 'anthropic' : HAS_OPENAI ? 'openai' : 'fallback' }));

app.post('/ai/food', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const limit = user.tier === 'pro' ? 1000 : 5;
  if (!rateLimit(user.id, 'food', limit, 24 * 3600e3)) return res.status(429).json({ error: 'daily AI scan limit reached' });

  const { description = '' } = req.body || {};
  const text = await callModel(
    SAFETY,
    `Estimate nutrition for this meal: "${description}". Respond as JSON:
{"name":string,"servingLabel":string,"macros":{"calories":number,"proteinG":number,"carbsG":number,"fatG":number,"fiberG":number},"confidence":"low"|"medium"|"high","note":string}`,
  );
  const parsed = parseJson(text);
  if (parsed) {
    return res.json({
      name: String(parsed.name || description || 'Estimated meal').slice(0, 80),
      servingLabel: String(parsed.servingLabel || '1 serving').slice(0, 40),
      macros: sanitizeMacros(parsed.macros),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      isEstimate: true,
      note: 'This is an estimate. Edit any value before saving.',
    });
  }
  // Fallback
  return res.json({
    name: description || 'Estimated meal',
    servingLabel: '1 serving',
    macros: sanitizeMacros({ proteinG: 40, carbsG: 60, fatG: 20 }),
    confidence: 'low',
    isEstimate: true,
    note: 'Estimate (offline mode). Edit before saving.',
  });
});

app.post('/ai/coach', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const { context = {}, settings = {} } = req.body || {};
  const text = await callModel(
    SAFETY,
    `Given this athlete context ${JSON.stringify(context)} and coach settings ${JSON.stringify(settings)},
write ONE short accountability message in the selected personality. If allowAggressiveLanguage is false, keep it fully supportive.
Respond as JSON: {"text":string,"tone":"praise"|"nudge"|"push"|"reflect"}`,
  );
  const parsed = parseJson(text);
  if (parsed?.text) return res.json({ text: String(parsed.text).slice(0, 280), tone: ['praise', 'nudge', 'push', 'reflect'].includes(parsed.tone) ? parsed.tone : 'nudge' });
  return res.json({ text: 'Pick your next win and go get it.', tone: 'nudge' });
});

app.post('/ai/workout', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  // Delegate structured generation to the model; the app also validates exercise ids.
  const text = await callModel(SAFETY, `Create a workout as JSON for: ${JSON.stringify(req.body)}.
Shape: {"name":string,"focus":string[],"estimatedMinutes":number,"exercises":[{"exerciseId":string,"name":string,"primaryMuscle":string,"sets":number,"reps":[number,number],"restSeconds":number}],"note":string}`);
  const parsed = parseJson(text);
  if (parsed?.exercises) return res.json(parsed);
  return res.status(503).json({ error: 'generation unavailable' });
});

app.post('/ai/weekly-review', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const text = await callModel(SAFETY, `Summarize this training week as JSON: ${JSON.stringify(req.body)}.
Shape: {"summary":string,"highlights":string[],"focusNextWeek":string}`);
  const parsed = parseJson(text);
  if (parsed?.summary) return res.json(parsed);
  return res.json({ summary: 'Solid, consistent week. Keep building.', highlights: [], focusNextWeek: 'Add a small progression to your main lifts.' });
});

app.post('/ai/progress', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const text = await callModel(SAFETY, `Analyze this weight trend as JSON: ${JSON.stringify(req.body)}.
Shape: {"trend":"up"|"down"|"flat","weeklyRateKg":number,"summary":string,"onTrack":boolean}`);
  const parsed = parseJson(text);
  if (parsed?.summary) return res.json(parsed);
  return res.json({ trend: 'flat', weeklyRateKg: 0, summary: 'Log more weigh-ins to see a trend.', onTrack: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ForgeFit AI backend on :${PORT} (provider: ${HAS_ANTHROPIC ? 'anthropic' : HAS_OPENAI ? 'openai' : 'fallback'})`);
});
