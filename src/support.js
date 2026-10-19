import { t, errorText } from './i18n.js';
const $ = id => document.getElementById(id);
let contactMessage='이메일 접수 상태를 확인하고 있습니다.';
function contactStatus(message){contactMessage=message;$('contact-status').textContent=errorText(message);}
window.addEventListener('xd-language-change',()=>contactStatus(contactMessage));
const codes = new Set(['runtime', 'analyze', 'preview', 'export', 'script', 'promise']);
const sent = new Set();
let enabled = false, sending = false, requestId = null, lastContent = '';
const browser = /Edg\//.test(navigator.userAgent) ? 'Edge' : /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'Other';
let optedIn = false;
try { optedIn = localStorage.getItem('xd-bridge-error-notifications') === 'yes'; } catch {}
$('error-notifications').checked = optedIn;
$('error-notifications').onchange = event => {
  optedIn = event.target.checked;
  try { localStorage.setItem('xd-bridge-error-notifications', optedIn ? 'yes' : 'no'); } catch {}
};
const ready = fetch('/api/notify', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).then(config => {
  enabled = config.enabled === true;
  $('contact-send').disabled = !enabled;
  contactStatus(enabled ? '문의는 운영자 이메일로 전달됩니다.' : '이메일 접수 연결을 준비 중입니다. 현재는 전송할 수 없습니다.');
}).catch(() => { contactStatus('이메일 접수 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.'); });
export async function reportIssue(code) {
  if (!optedIn || !codes.has(code) || sent.has(code)) return;
  await ready;
  if (!enabled || !optedIn || sent.has(code)) return;
  sent.add(code);
  // A closed schema: no exception argument or conversion data can be serialized.
  try { await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'error', code, browser }), keepalive: true }); } catch {}
}
window.addEventListener('error', event => {
  // Resource-loading errors have no ErrorEvent; exclude extensions/other scripts.
  if (event instanceof ErrorEvent && (!event.filename || event.filename.startsWith(location.origin + '/'))) void reportIssue('script');
});
window.addEventListener('unhandledrejection', () => void reportIssue('promise'));
$('contact-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !enabled || !$('contact-form').reportValidity()) return;
  const email = $('contact-email').value.trim(), message = $('contact-message').value.trim();
  const content = JSON.stringify({ email, message });
  if (message.length < 10) { contactStatus('문의 내용을 10자 이상 입력해 주세요.'); return; }
  if (!requestId || content !== lastContent) { requestId = crypto.randomUUID(); lastContent = content; }
  sending = true; $('contact-send').disabled = true; contactStatus('이메일로 전달하고 있습니다…');
  try {
    const response = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify({ type: 'contact', email, message, consent: $('contact-consent').checked, website: $('contact-website').value, requestId }) });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw Error(result.error || '전송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    contactStatus('문의가 접수되었습니다. 입력하신 이메일로 답변드리겠습니다.');
    $('contact-form').reset(); requestId = null; lastContent = '';
  } catch (error) {
    contactStatus(error.name === 'TimeoutError' || error.name === 'TypeError' ? '연결을 확인하지 못했습니다. 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.' : error.message);
  } finally { sending = false; $('contact-send').disabled = !enabled; }
});
