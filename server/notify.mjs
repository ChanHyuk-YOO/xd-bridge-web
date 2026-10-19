import { createHash } from 'node:crypto';

// Only fixed diagnostic codes leave the browser. Never accept raw exceptions,
// stacks, URLs, filenames, document contents, attachments, or arbitrary recipients.
export const issues = {
  runtime: '변환 프로그램 준비 실패',
  analyze: 'XD 분석 실패',
  preview: '미리보기 생성 실패',
  export: '파일 내보내기 실패',
  script: '페이지 스크립트 오류',
  promise: '처리되지 않은 비동기 오류',
};
const browsers = new Set(['Chrome', 'Edge', 'Firefox', 'Safari', 'Other']);
const emailPattern = /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
const json = (res, code, body) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = code;
  res.end(JSON.stringify(body));
};

export function createHandler({ env = process.env, send = fetch, now = Date.now } = {}) {
  // A small instance-local throttle, not a distributed firewall. Resend's Free
  // quota is the final delivery cap; do not enable paid overages for this site.
  const attempts = new Map();
  return async (req, res) => {
    const enabled = env.NOTIFICATIONS_ENABLED === 'true' && !!env.RESEND_API_KEY && emailPattern.test(env.ALERT_EMAIL || '');
    if (req.method === 'GET') return json(res, 200, { enabled });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: '허용되지 않는 요청입니다.' });
    }
    const origin = new URL(env.SITE_URL || 'https://xd-bridge-web.vercel.app').origin;
    if (req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      return json(res, 403, { error: '사이트 안에서 다시 시도해 주세요.' });
    }
    if (!enabled) return json(res, 503, { error: '이메일 접수 연결이 아직 준비되지 않았습니다. 문의 내용은 복사해서 보관해 주세요.' });
    try {
      let body = req.body;
      if (body == null) {
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 8192) return json(res, 413, { error: '문의 내용이 너무 깁니다.' });
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 8192) return json(res, 413, { error: '문의 내용이 너무 깁니다.' });
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: '올바른 내용을 입력해 주세요.' });
      const diagnostic = body.type === 'error';
      const fields = diagnostic ? ['type', 'code', 'browser'] : ['type', 'email', 'message', 'consent', 'website', 'requestId'];
      if (Object.keys(body).some(key => !fields.includes(key))) return json(res, 400, { error: '허용되지 않는 항목이 포함되어 있습니다.' });
      let subject, text, replyTo, key;
      const date = new Date(now()).toISOString().slice(0, 10);
      if (diagnostic) {
        if (!Object.hasOwn(issues, body.code) || !browsers.has(body.browser)) return json(res, 400, { error: '올바르지 않은 오류 코드입니다.' });
        subject = `[XD Bridge 오류] ${issues[body.code]}`;
        text = `오류 코드: ${body.code}\n발생 단계: ${issues[body.code]}\n브라우저: ${body.browser}\n접수일(UTC): ${date}\n\n동일 코드·브라우저 알림은 하루 한 번 전달됩니다.\n원본 오류 문구, 파일명, XD 내용, 사용자 식별자는 수집하지 않습니다.\n사이트: ${origin}/`;
        // Identical payload and key across instances, bounded to 30 types/day.
        // Keep deduplication stable within a site, including during host moves.
        const siteKey = createHash('sha256').update(origin).digest('hex').slice(0, 16);
        key = `error/${siteKey}/${date}/${body.code}/${body.browser}`;
      } else {
        if (body.type !== 'contact') return json(res, 400, { error: '올바르지 않은 문의 유형입니다.' });
        if (body.website) return json(res, 200, { ok: true }); // Honeypot.
        if (body.consent !== true || typeof body.email !== 'string' || body.email.length > 254 || !emailPattern.test(body.email) || typeof body.message !== 'string' || body.message.trim().length < 10 || body.message.length > 2000 || !/^[a-f0-9-]{36}$/i.test(body.requestId || '')) {
          return json(res, 400, { error: '이메일·문의 내용(10~2,000자)·전송 동의를 확인해 주세요.' });
        }
        subject = '[XD Bridge 문의] 새 문의가 접수되었습니다';
        text = `답변받을 이메일: ${body.email}\n\n${body.message.trim()}\n\n문의자가 입력한 내용입니다. 첨부 파일은 수집하지 않습니다.`;
        replyTo = body.email;
        key = `contact/${body.requestId}`;
      }
      // IP addresses are used only for a temporary one-way throttle key.
      // Forwarded address headers must be normalized by the hosting provider.
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
      const throttleKey = createHash('sha256').update(ip).digest('hex');
      const hour = Math.floor(now() / 3600000);
      for (const [k, v] of attempts) if (v.hour !== hour) attempts.delete(k);
      if (attempts.size > 5000 && !attempts.has(throttleKey)) return json(res, 429, { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      const entry = attempts.get(throttleKey) || { hour, contact: 0, error: 0 };
      const counter = diagnostic ? 'error' : 'contact';
      if (entry[counter] >= (diagnostic ? 12 : 3)) return json(res, 429, { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      entry[counter]++;
      attempts.set(throttleKey, entry);
      const payload = { from: env.ALERT_FROM || 'XD Bridge <onboarding@resend.dev>', to: [env.ALERT_EMAIL], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) };
      const response = await send('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.id !== 'string') return json(res, 503, { error: '이메일을 전달하지 못했습니다. 문의 내용은 보관하고 잠시 후 다시 시도해 주세요.' });
      return json(res, 200, { ok: true });
    } catch {
      // No raw exception/provider response is returned or logged.
      return json(res, 503, { error: '요청을 처리하지 못했습니다. 문의 내용은 보관하고 잠시 후 다시 시도해 주세요.' });
    }
  };
}
