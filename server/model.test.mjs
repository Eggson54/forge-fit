import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, ModelUnavailable, classify, generateJson } from './model.mjs';

/** Stands in for the SDK client and records what was sent. */
function fakeClient(respond) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return respond(params);
        },
      },
    },
  };
}
const ok = (obj) => () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }] });
const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };
const h = new Headers();

test('sends the photo, before the text that asks about it', async () => {
  // The bug this rewrite started from: the photo never reached a model.
  const client = fakeClient(ok({ text: 'hi' }));
  await generateJson({ system: 's', text: 'what is this', image: { data: 'AAAA', mediaType: 'image/jpeg' }, schema: SCHEMA }, { client });
  const content = client.calls[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.deepEqual(content[0].source, { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' });
  assert.equal(content[1].type, 'text');
});

test('asks for the schema through structured outputs, not a regex', async () => {
  const client = fakeClient(ok({ text: 'hi' }));
  const out = await generateJson({ system: 's', text: 't', schema: SCHEMA, effort: 'low' }, { client });
  const p = client.calls[0];
  assert.deepEqual(p.output_config, { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } });
  assert.deepEqual(out, { text: 'hi' });
});

test('uses the configured model and opts into refusal fallbacks', async () => {
  const client = fakeClient(ok({ text: 'hi' }));
  await generateJson({ system: 's', text: 't', schema: SCHEMA }, { client });
  const p = client.calls[0];
  assert.equal(p.model, MODEL);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
});

test('does not cap output so tightly that thinking cuts the answer off', async () => {
  const client = fakeClient(ok({ text: 'hi' }));
  await generateJson({ system: 's', text: 't', schema: SCHEMA }, { client });
  assert.ok(client.calls[0].max_tokens >= 8000);
});

test('reads the text block, skipping thinking', async () => {
  const out = await generateJson({ system: 's', text: 't', schema: SCHEMA }, { client: fakeClient(ok({ text: 'answer' })) });
  assert.equal(out.text, 'answer');
});

test('treats a refusal as unavailable, never as an answer', async () => {
  const client = fakeClient(() => ({ stop_reason: 'refusal', stop_details: { category: 'bio' }, content: [] }));
  await assert.rejects(generateJson({ system: 's', text: 't', schema: SCHEMA }, { client }), (e) => e instanceof ModelUnavailable && e.reason === 'refused');
});

test('treats a truncated reply as unavailable rather than parsing half of it', async () => {
  const client = fakeClient(() => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"text": "cut' }] }));
  await assert.rejects(generateJson({ system: 's', text: 't', schema: SCHEMA }, { client }), (e) => e.reason === 'truncated');
});

test('treats unparseable output as unavailable', async () => {
  const client = fakeClient(() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }));
  await assert.rejects(generateJson({ system: 's', text: 't', schema: SCHEMA }, { client }), (e) => e.reason === 'unparseable');
});

test('turns an API error into a reason instead of an empty answer', async () => {
  // The old code read `content[0].text ?? ''`, so this became canned text.
  const client = fakeClient(() => {
    throw Anthropic.APIError.generate(401, { error: { type: 'authentication_error', message: 'x' } }, 'x', h);
  });
  await assert.rejects(generateJson({ system: 's', text: 't', schema: SCHEMA }, { client }), (e) => e.reason === 'bad-key');
});

test('classifies each failure, most specific first', () => {
  const gen = (status, type) => Anthropic.APIError.generate(status, { error: { type, message: type } }, type, h);
  assert.equal(classify(new Anthropic.APIConnectionTimeoutError()).reason, 'timeout');
  // A connection error is an APIError in this SDK; checked first, or every
  // network failure would read as an API one.
  assert.equal(classify(new Anthropic.APIConnectionError({ message: 'down' })).reason, 'network');
  assert.equal(classify(gen(401, 'authentication_error')).reason, 'bad-key');
  assert.equal(classify(gen(403, 'permission_error')).reason, 'permission');
  assert.equal(classify(gen(429, 'rate_limit_error')).reason, 'rate-limited');
  assert.equal(classify(gen(400, 'invalid_request_error')).reason, 'bad-request');
  assert.equal(classify(gen(529, 'overloaded_error')).reason, 'overloaded');
  assert.equal(classify(gen(500, 'api_error')).reason, 'upstream');
  assert.equal(classify(new Error('?')).reason, 'unknown');
});

test('says there is no provider rather than pretending', async () => {
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(generateJson({ system: 's', text: 't', schema: SCHEMA }), (e) => e.reason === 'no-provider');
  } finally {
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OPENAI_API_KEY = saved.o;
  }
});

test('refuses a photo on the text-only path instead of estimating from nothing', async () => {
  const saved = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  try {
    await assert.rejects(
      generateJson({ system: 's', text: 't', image: { data: 'A', mediaType: 'image/jpeg' }, schema: SCHEMA }),
      (e) => e.reason === 'no-vision',
    );
  } finally {
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
    if (saved.o) process.env.OPENAI_API_KEY = saved.o;
    else delete process.env.OPENAI_API_KEY;
  }
});
