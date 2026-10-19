import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = (await fs.readFile('src/support.js', 'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function', 'async function');
async function boot({ optIn = false, fail = false } = {}) {
  const elements = new Map();
  const posts = [];
  const events = {};
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: true, textContent: '', listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; }, reportValidity: () => true, reset() { for (const e of elements.values()) { e.value = ''; e.checked = false; } } });
    return elements.get(id);
  };
  let nextId = 0;
  const context = vm.createContext({ t:s=>s,errorText:s=>s, document: { getElementById: element }, navigator: { userAgent: 'Chrome/100' }, localStorage: { getItem: () => optIn ? 'yes' : 'no', setItem() {} }, location: { origin: 'https://xd-bridge-web.vercel.app' }, window: { addEventListener: (type, callback) => events[type] = callback }, ErrorEvent: class {}, crypto: { randomUUID: () => `12345678-1234-1234-1234-${String(++nextId).padStart(12, '0')}` }, AbortSignal,
    fetch: async (url, options) => { if (options?.method !== 'POST') return { ok: true, json: async () => ({ enabled: true }) }; posts.push(JSON.parse(options.body)); return { ok: !fail, json: async () => fail ? ({ error: '이메일을 전달하지 못했습니다.' }) : ({ ok: true }) }; },
  });
  vm.runInContext(source, context);
  await vm.runInContext('ready', context);
  return { context, element, posts, events };
}
test('automatic diagnostics are off until consent, exclude private content and deduplicate', async () => {
  const { context, element, posts } = await boot();
  await vm.runInContext("reportIssue('analyze')", context);
  assert.equal(posts.length, 0);
  element('error-notifications').onchange({ target: { checked: true } });
  await vm.runInContext("reportIssue('analyze', {filename:'SECRET.xd', stack:'PRIVATE DESIGN'})", context);
  await vm.runInContext("reportIssue('analyze')", context);
  await vm.runInContext("reportIssue('SECRET.xd')", context);
  assert.deepEqual(posts, [{ type: 'error', code: 'analyze', browser: 'Chrome' }]);
  element('error-notifications').onchange({ target: { checked: false } });
  await vm.runInContext("reportIssue('preview')", context);
  assert.equal(posts.length, 1);
});
test('contact preserves entered content and submission ID on delivery failure', async () => {
  const { element, posts } = await boot({ fail: true });
  element('contact-email').value = 'visitor@example.com';
  element('contact-message').value = '문의 내용은 실패해도 지워지면 안 됩니다.';
  element('contact-consent').checked = true;
  await element('contact-form').listeners.submit({ preventDefault() {} });
  await element('contact-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 2); assert.equal(posts[0].requestId, posts[1].requestId);
  assert.equal(element('contact-message').value, '문의 내용은 실패해도 지워지면 안 됩니다.');
  assert.match(element('contact-status').textContent, /전달하지 못했습니다/);
  assert.equal(element('contact-send').disabled, false);
});
test('contact is cleared only after confirmed delivery', async () => {
  const { element, posts } = await boot();
  element('contact-email').value = 'visitor@example.com'; element('contact-message').value = '이메일 문의 전송을 확인합니다.'; element('contact-consent').checked = true;
  await element('contact-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 1); assert.equal(element('contact-message').value, '');
  assert.match(element('contact-status').textContent, /접수되었습니다/);
});
