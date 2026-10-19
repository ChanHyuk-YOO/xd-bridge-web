import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from '../netlify/functions/notify.mjs';

test('Netlify adapter streams bodies and preserves origin, size and privacy checks', async () => {
  const origin = 'https://example.netlify.app';
  const deliveries = [];
  const handler = createNetlifyHandler({
    env: { SITE_URL: origin, NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 'test-secret', ALERT_EMAIL: 'owner@example.com' },
    send: async (_, options) => { deliveries.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: 'test' }) }; },
  });
  const request = (body, from = origin) => new Request(origin + '/api/notify', {
    method: 'POST', headers: { origin: from, 'content-type': 'application/json', 'x-forwarded-for': 'spoofed' }, body: JSON.stringify(body),
  });
  const config = await handler(new Request(origin + '/api/notify'));
  assert.deepEqual(await config.json(), { enabled: true });
  const diagnostic = { type: 'error', code: 'analyze', browser: 'Chrome' };
  assert.equal((await handler(request(diagnostic, 'https://untrusted.example'), { ip: '192.0.2.1' })).status, 403);
  assert.equal((await handler(request({ ...diagnostic, raw: 'x'.repeat(9000) }), { ip: '192.0.2.1' })).status, 413);
  const result = await handler(request(diagnostic), { ip: '192.0.2.1' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(deliveries.length, 1);
  assert.deepEqual(deliveries[0].to, ['owner@example.com']);
  assert.match(deliveries[0].text, /https:\/\/example.netlify.app/);
  assert.doesNotMatch(JSON.stringify(deliveries), /spoofed|192\.0\.2\.1|test-secret/);
});
