import type { Env } from './index';
import { HttpError, json } from './http';

export async function changes(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') throw new HttpError(405, 'GET 요청이 필요합니다.');
  const after = Number(new URL(request.url).searchParams.get('after') || 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, '잘못된 변경 번호입니다.');
  const rows = await env.DB.prepare(`SELECT c.seq, c.document_id, d.id, d.normalized_url, d.title, d.body,
    d.tags_json, d.location, d.created_at, d.version FROM changes c LEFT JOIN documents d ON d.id = c.document_id
    WHERE c.seq > ? ORDER BY c.seq LIMIT 10`).bind(after).all();
  return json({ changes: rows.results.map(({ tags_json, ...row }) => ({ ...row, tags: tags_json ? JSON.parse(String(tags_json)) : [] })),
    next: rows.results.length ? rows.results[rows.results.length - 1].seq : after, has_more: rows.results.length === 10 });
}
