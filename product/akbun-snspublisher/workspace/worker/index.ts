import { authenticate } from './auth';
import { json } from './http';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_OWNER_SUB?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true });
    const identity = await authenticate(request, env);
    if (!identity) return json({ error: '로그인이 필요합니다.' }, 401);
    if (url.pathname === '/api/me' && request.method === 'GET') return json({ authenticated: true, via: identity });
    return json({ error: '경로를 찾을 수 없습니다.' }, 404);
  },
} satisfies ExportedHandler<Env>;
