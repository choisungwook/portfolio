import { authenticate, hashToken } from './auth';
import { documents } from './documents';
import { HttpError, json, readJson, text } from './http';
import { aiLimits } from './ai';
import { mcp } from './mcp';
import { changes } from './sync';
import { importDocument } from './import';
import { feeds, refreshStaleFeeds } from './rss/index';
import { publicView, shares } from './shares';
import { tags } from './tags';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_OWNER_SUB?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_MONTHLY_CALL_LIMIT?: string;
  AI_MONTHLY_BUDGET_WON?: string;
  AI_MAX_CALL_WON?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const automation = url.pathname.startsWith('/automation/');
    if (automation) {
      url.pathname = '/api/' + url.pathname.slice('/automation/'.length);
      request = new Request(url, request);
    }
    const isPublic = url.pathname.startsWith('/public/');
    if (!isPublic && !url.pathname.startsWith('/api/') && url.pathname !== '/mcp') return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true });
    try {
      if (isPublic) return await publicView(request, env);
      const identity = await authenticate(request, env);
      if (!identity) return json({ error: '로그인이 필요합니다.' }, 401);
      if ((automation || url.pathname === '/mcp') && identity === 'browser') return json({ error: '자동화 경로는 API 토큰이 필요합니다.' }, 403);
      if (identity === 'read-token' && (url.pathname === '/mcp' || !['GET', 'HEAD'].includes(request.method))) {
        return json({ error: '읽기 전용 토큰은 조회만 할 수 있습니다.' }, 403);
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if ((origin && origin !== url.origin) || (identity === 'browser' && origin !== url.origin)) {
          return json({ error: '같은 사이트에서 요청하세요.' }, 403);
        }
      }
      if (url.pathname === '/api/changes') return await changes(request, env);
      if (url.pathname === '/api/import') return await importDocument(request, env);
      if (url.pathname === '/mcp') return await mcp(request, env, ctx);
      if (url.pathname === '/api/me' && request.method === 'GET') return json({ authenticated: true });
      if (url.pathname.startsWith('/api/documents')) return await documents(request, env, ctx);
      if (url.pathname === '/api/tags' || url.pathname.startsWith('/api/tags/')) return await tags(request, env);
      if (url.pathname === '/api/feed-items' || url.pathname === '/api/feeds' || url.pathname.startsWith('/api/feeds/')) return await feeds(request, env, ctx);
      if (url.pathname === '/api/shares' || url.pathname.startsWith('/api/shares/')) {
        if (identity !== 'browser') return json({ error: '공개 링크 관리는 브라우저 로그인 후 이용하세요.' }, 403);
        return await shares(request, env);
      }
      if (url.pathname === '/api/ai' && request.method === 'GET') {
        const usage = await env.DB.prepare('SELECT calls, reserved_won FROM ai_usage WHERE month = ?')
          .bind(new Date().toISOString().slice(0, 7)).first();
        return json({ enabled: Boolean(aiLimits(env)), limits: aiLimits(env), usage: usage ?? { calls: 0, reserved_won: 0 } });
      }
      if ((url.pathname === '/api/tokens' || url.pathname.startsWith('/api/tokens/')) && identity !== 'browser') {
        return json({ error: '토큰 관리는 브라우저 로그인 후 이용하세요.' }, 403);
      }
      if (url.pathname === '/api/tokens' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id, name, scope, created_at, revoked_at FROM api_tokens ORDER BY created_at DESC').all();
        return json({ tokens: result.results });
      }
      if (url.pathname === '/api/tokens' && request.method === 'POST') {
        const input = await readJson(request);
        const name = text(input.name, '이름', 80);
        const scope = input.scope === undefined ? 'write' : String(input.scope);
        if (!['read', 'write'].includes(scope)) throw new HttpError(400, '토큰 범위는 read 또는 write입니다.');
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO api_tokens(id, name, scope, token_hash) VALUES (?, ?, ?, ?)')
          .bind(id, name, scope, await hashToken(token)).run();
        return json({ id, name, scope, token }, 201);
      }
      const tokenMatch = url.pathname.match(/^\/api\/tokens\/([^/]+)$/);
      if (tokenMatch && request.method === 'DELETE') {
        const result = await env.DB.prepare(`UPDATE api_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND revoked_at IS NULL RETURNING id`).bind(tokenMatch[1]).all();
        if (!result.results.length) throw new HttpError(404, '토큰을 찾을 수 없습니다.');
        return json({ revoked: true });
      }
      return json({ error: '경로를 찾을 수 없습니다.' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.' }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshStaleFeeds(env));
  },
} satisfies ExportedHandler<Env>;
