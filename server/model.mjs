import Anthropic from '@anthropic-ai/sdk';

/**
 * One call to a model, returning JSON that matches a schema — or a reason
 * it could not.
 *
 * The rule this module holds to: a failure is never dressed up as an answer.
 * The previous code read `data.content[0].text ?? ''`, so a bad key, a rate
 * limit or an overloaded API all came back as an empty string, which each
 * route then replaced with canned text — "Solid, consistent week. Keep
 * building." — returned to the app as though a model had written it. Now
 * every failure is a `ModelUnavailable` with a reason, the routes answer 503,
 * and the app's existing fallback takes over: its on-device coach, which is
 * rule-based and says so.
 *
 * Structured outputs replace "respond with STRICT JSON" and a regex that
 * fished for the first `{`. The API enforces the schema; `validate.mjs`
 * still enforces the sense of what comes back.
 */

/**
 * Anthropic's current default. Configurable, because the model is a cost
 * decision that belongs to whoever pays the bill: AI_MODEL=claude-sonnet-5-5
 * is half the price per token. Not changed here on anybody's behalf.
 */
export const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';

/** Long enough for a photo estimate with thinking; short enough for a phone. */
const TIMEOUT_MS = 45_000;

export class ModelUnavailable extends Error {
  constructor(reason, detail) {
    super(`Model unavailable: ${reason}`);
    this.reason = reason;
    this.detail = detail;
  }
}

let anthropic;
function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // One retry: the SDK retries 429, 5xx and overloaded (529) itself. More
  // than one, at 45 seconds each, is a phone staring at a spinner.
  anthropic ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return anthropic;
}

/**
 * Map an SDK error to a reason. Most specific first: in the TypeScript SDK a
 * connection error is a subclass of APIError, so it has to be caught first
 * or every network failure reads as an API one.
 */
export function classify(e) {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ModelUnavailable('timeout');
  if (e instanceof Anthropic.APIConnectionError) return new ModelUnavailable('network');
  if (e instanceof Anthropic.AuthenticationError) return new ModelUnavailable('bad-key');
  if (e instanceof Anthropic.PermissionDeniedError) return new ModelUnavailable('permission');
  if (e instanceof Anthropic.RateLimitError) return new ModelUnavailable('rate-limited');
  if (e instanceof Anthropic.BadRequestError) return new ModelUnavailable('bad-request', e.message);
  if (e instanceof Anthropic.APIError) {
    return new ModelUnavailable(e.type === 'overloaded_error' ? 'overloaded' : 'upstream', e.message);
  }
  return new ModelUnavailable('unknown', e?.message);
}

/**
 * Ask for JSON matching `schema`.
 *
 * `effort` trades thinking depth against spend; the routes set it per task.
 * `client` is injectable so the tests can stand in for the API.
 */
export async function generateJson({ system, text, image = null, schema, effort = 'medium' }, { client } = {}) {
  const c = client ?? anthropicClient();
  if (c) return viaAnthropic(c, { system, text, image, schema, effort });
  if (process.env.OPENAI_API_KEY) return viaOpenAI({ system, text, image, schema });
  throw new ModelUnavailable('no-provider');
}

async function viaAnthropic(c, { system, text, image, schema, effort }) {
  // The image goes before the text that asks about it.
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
  content.push({ type: 'text', text });

  let res;
  try {
    res = await c.beta.messages.create({
      model: MODEL,
      // Thinking is always on for this model and counts against the cap, so
      // a tight cap would cut the answer off mid-JSON. Output is billed as
      // generated, so the ceiling costs nothing unless it is used.
      max_tokens: 16000,
      // If the model declines on safety grounds, Anthropic re-runs the request
      // on its recommended fallback inside the same call, instead of the
      // refusal coming back here.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    throw classify(e);
  }

  // Checked before content is read: a refusal carries no answer, and a cut-off
  // one carries half of one.
  if (res.stop_reason === 'refusal') throw new ModelUnavailable('refused', res.stop_details?.category ?? null);
  if (res.stop_reason === 'max_tokens') throw new ModelUnavailable('truncated');

  const block = (res.content ?? []).find((b) => b.type === 'text');
  try {
    return JSON.parse(block?.text ?? '');
  } catch {
    throw new ModelUnavailable('unparseable');
  }
}

/**
 * The OpenAI path this server already supported, kept working and otherwise
 * unchanged: text only, so a photo estimate is refused rather than silently
 * estimated from nothing. It gains the same timeout and the same refusal to
 * pass off a failure as an answer.
 */
async function viaOpenAI({ system, text, image, schema }) {
  if (image) throw new ModelUnavailable('no-vision');
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${system}\n\nRespond with JSON matching this schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ModelUnavailable(e?.name === 'TimeoutError' ? 'timeout' : 'network');
  }
  if (!res.ok) throw new ModelUnavailable(res.status === 401 ? 'bad-key' : res.status === 429 ? 'rate-limited' : 'upstream');
  const data = await res.json().catch(() => null);
  try {
    return JSON.parse(data?.choices?.[0]?.message?.content ?? '');
  } catch {
    throw new ModelUnavailable('unparseable');
  }
}

export const provider = () =>
  process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'none';
