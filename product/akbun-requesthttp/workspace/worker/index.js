// Cloudflare Worker: serves the same src/ page the desktop app ships, plus
// /api/proxy, which performs the HTTP request server side because a browser
// cannot call arbitrary origins itself. TLS verification cannot be disabled
// here — that is a desktop-only setting.

import { validateSpec, specToInit, requestTimeoutMs, resultFrom } from './proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/proxy' && request.method === 'POST') {
      return proxy(request);
    }
    return env.ASSETS.fetch(request);
  },
};

async function proxy(request) {
  // ponytail: an Origin check is all the auth a static page can carry; it
  // stops other sites embedding this endpoint, not a curl user. Cloudflare
  // rate limiting is the backstop if abuse ever shows up.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'cross-origin use is not allowed' }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  const spec = payload.spec || {};
  const settings = payload.settings || {};
  const invalid = validateSpec(spec);
  if (invalid) return json({ error: invalid }, 400);

  const started = Date.now();
  let response;
  try {
    response = await fetch(spec.url, {
      ...specToInit(spec, settings),
      signal: AbortSignal.timeout(requestTimeoutMs(settings)),
    });
  } catch (error) {
    return json({ error: String(error) }, 502);
  }
  const bytes = await response.arrayBuffer();
  const body = new TextDecoder().decode(bytes);
  return json(resultFrom(response, body, Date.now() - started, bytes.byteLength));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
