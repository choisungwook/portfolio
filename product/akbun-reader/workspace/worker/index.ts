// Entry point. Static files under src/ are served by the assets binding before
// this code runs; only /api/* reaches the Worker (see run_worker_first).
// Authentication (Access JWT and API tokens) lands with the deployment issue.

import { normalizeUrl } from './lib/normalize-url.js';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, version: '0.1.0' });
    }

    if (url.pathname === '/api/normalize' && request.method === 'GET') {
      const target = url.searchParams.get('url') ?? '';
      try {
        return json({ url: normalizeUrl(target) });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
