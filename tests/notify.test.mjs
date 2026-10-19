import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/notify.mjs';
const origin = 'https://xd-bridge-web.vercel.app';
const env = { NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 'test-secret', ALERT_EMAIL: 'owner@example.com' };
const contact = { type: 'contact', email: 'visitor@example.com', message: '테스트 문의입니다. 변환을 확인해 주세요.', consent: true, website: '', requestId: '12345678-1234-1234-1234-123456789abc' };
const calls = [];
const send = async (url, options) => { calls.push({ url, options, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ id: 'test-delivery' }) }; };
async function request(handler, body, extra = {}) {
  const req = { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body, ...extra };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
  await handler(req, res); return res;
}
test('disabled service fails closed and configuration never exposes credentials or address', async () => {
  const handler = createHandler({ env: { ...env, NOTIFICATIONS_ENABLED: 'false' }, send });
  const config = await request(handler, null, { method: 'GET' });
  assert.deepEqual(config.body, { enabled: false });
  assert.equal((await request(handler, contact)).statusCode, 503);
});
test('contact sends only to server recipient and supplies visitor reply-to', async () => {
  calls.length = 0;
  const result = await request(createHandler({ env, send }), contact);
  assert.equal(result.statusCode, 200); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload.to, ['owner@example.com']);
  assert.equal(calls[0].payload.reply_to, contact.email);
  assert.match(calls[0].payload.text, /테스트 문의/);
  assert.match(calls[0].options.headers['Idempotency-Key'], /^contact\//);
  assert.doesNotMatch(JSON.stringify(result.body), /secret|owner@example/);
});
test('untrusted origins, missing consent, header injection, raw diagnostics and recipients are rejected', async () => {
  calls.length = 0;
  const handler = createHandler({ env, send });
  assert.equal((await request(handler, contact, { headers: { origin: 'https://attacker.example', 'content-type': 'application/json' } })).statusCode, 403);
  for (const body of [{ ...contact, consent: false }, { ...contact, to: 'other@example.com' }, { ...contact, email: 'a@example.com\r\nBcc: b@example.com' }, { type: 'error', code: 'analyze', browser: 'Chrome', filename: 'PRIVATE.xd' }, { type: 'error', code: '__proto__', browser: 'Chrome' }]) {
    assert.equal((await request(handler, body)).statusCode, 400);
  }
  assert.equal(calls.length, 0);
});
test('diagnostic payload contains only fixed labels; daily keys work across server instances', async () => {
  calls.length = 0;
  const fixedNow = () => Date.parse('2026-10-19T04:00:00Z');
  const body = { type: 'error', code: 'analyze', browser: 'Firefox' };
  await request(createHandler({ env, send, now: fixedNow }), body);
  await request(createHandler({ env, send, now: fixedNow }), body);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(calls[0].payload, calls[1].payload);
  assert.match(calls[0].payload.text, /analyze/);
  assert.doesNotMatch(JSON.stringify(calls[0].payload), /192\.0\.2\.1|stack|userAgent|input\.xd/);
  const movedOrigin = 'https://xd-bridge-web.netlify.app';
  await request(createHandler({ env: { ...env, SITE_URL: movedOrigin }, send, now: fixedNow }), body,
    { headers: { origin: movedOrigin, 'content-type': 'application/json' } });
  assert.notEqual(calls[0].options.headers['Idempotency-Key'], calls[2].options.headers['Idempotency-Key']);
});
test('body limits, honeypot, per-instance throttle and delivery failure are handled', async () => {
  calls.length = 0;
  const handler = createHandler({ env, send });
  assert.equal((await request(handler, { ...contact, message: 'x'.repeat(9000) })).statusCode, 413);
  assert.equal((await request(handler, { ...contact, website: 'spam' })).statusCode, 200);
  assert.equal(calls.length, 0);
  for (let i = 0; i < 3; i++) assert.equal((await request(handler, contact)).statusCode, 200);
  assert.equal((await request(handler, contact)).statusCode, 429);
  const failed = createHandler({ env, send: async () => ({ ok: false, json: async () => ({ message: 'provider secret detail' }) }) });
  const result = await request(failed, contact);
  assert.equal(result.statusCode, 503); assert.doesNotMatch(JSON.stringify(result.body), /secret/);
});
