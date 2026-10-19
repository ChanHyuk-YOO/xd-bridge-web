import { Readable } from 'node:stream';
import { createHandler } from '../../server/notify.mjs';

// Reuse the same validation, consent checks and fixed-recipient delivery rules.
export function createNetlifyHandler(options = {}) {
  const handle = createHandler(options);
  return async (request, context = {}) => {
    const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    req.method = request.method;
    req.headers = Object.fromEntries(request.headers);
    // Trust Netlify's normalized client address, never a caller-supplied header.
    req.headers['x-forwarded-for'] = context.ip || 'unknown';
    const headers = new Headers();
    let body = '';
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers.set(name, value); },
      end(value) { body = value; },
    };
    await handle(req, res);
    return new Response(body, { status: res.statusCode, headers });
  };
}

export default createNetlifyHandler();
export const config = { path: '/api/notify' };
