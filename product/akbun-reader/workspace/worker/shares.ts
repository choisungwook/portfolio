import type { Env } from './index';
import { HttpError, json, readJson } from './http';
import { getFeed, listFeedItems, pageOffset } from './rss/index';
import { tagExists, tagName } from './tags';

type ShareRow = { id: string; kind: 'tag' | 'feed'; target: string; title: string; created_at: string };
const shareColumns = `s.id, s.kind, s.target, s.created_at, CASE WHEN s.kind = 'feed' THEN f.title ELSE s.target END AS title`;
const shareFrom = "FROM shares s LEFT JOIN feeds f ON s.kind = 'feed' AND f.id = s.target";

export function publicHeaders(): Record<string, string> {
  return { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
}

export async function shares(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/shares' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT ${shareColumns} ${shareFrom} ORDER BY s.created_at DESC`).all<ShareRow>();
    return json({ shares: rows.results });
  }
  if (url.pathname === '/api/shares' && request.method === 'POST') {
    const input = await readJson(request);
    if (input.kind !== 'tag' && input.kind !== 'feed') throw new HttpError(400, '공개 대상은 tag 또는 feed입니다.');
    let target: string;
    if (input.kind === 'tag') {
      target = tagName(input.target);
      if (!await tagExists(target, env)) throw new HttpError(404, '태그를 찾을 수 없습니다.');
    } else {
      if (typeof input.target !== 'string') throw new HttpError(400, 'RSS 번호가 필요합니다.');
      target = (await getFeed(input.target, env)).id;
    }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const inserted = await env.DB.prepare('INSERT INTO shares(id, kind, target) VALUES (?, ?, ?) ON CONFLICT(kind, target) DO NOTHING RETURNING id')
      .bind(id, input.kind, target).all();
    const row = await env.DB.prepare(`SELECT ${shareColumns} ${shareFrom} WHERE s.kind = ? AND s.target = ?`).bind(input.kind, target).first<ShareRow>();
    return json(row, inserted.results.length ? 201 : 200);
  }
  const match = url.pathname.match(/^\/api\/shares\/([^/]+)$/);
  if (match && request.method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM shares WHERE id = ? RETURNING id').bind(match[1]).all();
    if (!result.results.length) throw new HttpError(404, '공개 링크를 찾을 수 없습니다.');
    return json({ deleted: true });
  }
  throw new HttpError(404, '경로를 찾을 수 없습니다.');
}

export async function publicView(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/public\/([a-f0-9]{32})(\/data)?$/);
  if (!match || !['GET', 'HEAD'].includes(request.method)) return new Response('찾을 수 없습니다.', { status: 404, headers: publicHeaders() });
  const share = await env.DB.prepare(`SELECT ${shareColumns} ${shareFrom} WHERE s.id = ?`).bind(match[1]).first<ShareRow>();
  if (!share) return new Response('공개 링크가 없거나 삭제되었습니다.', { status: 404, headers: publicHeaders() });
  if (!match[2]) {
    const page = await env.ASSETS.fetch(new Request(new URL('/public.html', url), { method: 'GET' }));
    return new Response(page.body, { status: page.status, headers: { ...Object.fromEntries(page.headers), ...publicHeaders() } });
  }
  const offset = pageOffset(url);
  if (share.kind === 'feed') {
    const page = await listFeedItems(env, share.target, offset);
    return Response.json({ kind: 'feed', title: share.title, items: page.items.map(({ document_id, feed_id, feed_title, ...item }) => item), next_offset: page.next_offset }, { headers: publicHeaders() });
  }
  const rows = await env.DB.prepare(`SELECT id, title, normalized_url, summary_json, created_at FROM documents
    WHERE EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?) ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`)
    .bind(share.target, offset).all<{ summary_json: string }>();
  return Response.json({
    kind: 'tag', title: share.title,
    items: rows.results.slice(0, 50).map(({ summary_json, ...row }) => ({ ...row, summary: JSON.parse(summary_json) })),
    next_offset: rows.results.length > 50 ? offset + 50 : null,
  }, { headers: publicHeaders() });
}
