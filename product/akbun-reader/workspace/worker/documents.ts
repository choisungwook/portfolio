import type { Env } from './index';
import { HttpError, json, readJson, tags, text } from './http';
import { normalizeUrl } from './lib/normalize-url.js';
import { enrichDocument } from './ai';
import { extractDocument } from './extraction/index';

type Row = Record<string, unknown> & { id: string; version: number; body?: string; tags_json: string; summary_json: string; suggested_tags_json: string };
function serialize(row: Row) {
  const { tags_json, summary_json, suggested_tags_json, ...document } = row;
  return { ...document, tags: JSON.parse(tags_json), summary: JSON.parse(summary_json), suggested_tags: JSON.parse(suggested_tags_json) };
}

export async function getDocument(id: string, env: Env) {
  const row = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<Row>();
  if (!row) throw new HttpError(404, '문서를 찾을 수 없습니다.');
  return serialize(row);
}

export async function documents(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (match) {
    const id = match[1];
    if (request.method === 'GET') return json(await getDocument(id, env));
    if (request.method === 'PATCH') {
      const input = await readJson(request);
      if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) throw new HttpError(400, '문서 버전이 필요합니다.');
      const fields: string[] = [];
      const values: (string | number)[] = [];
      if (input.tags !== undefined) { fields.push('tags_json = ?'); values.push(JSON.stringify(tags(input.tags))); }
      if (input.location !== undefined) {
        if (!['inbox', 'later', 'archive'].includes(String(input.location))) throw new HttpError(400, '잘못된 위치입니다.');
        fields.push('location = ?'); values.push(String(input.location));
      }
      if (input.is_read !== undefined) {
        if (typeof input.is_read !== 'boolean') throw new HttpError(400, '읽음 상태는 boolean이어야 합니다.');
        fields.push('is_read = ?'); values.push(Number(input.is_read));
      }
      if (input.approve_tags !== undefined) {
        if (input.tags !== undefined) throw new HttpError(400, '태그 편집과 추천 승인은 따로 요청하세요.');
        const current = await getDocument(id, env);
        const selected = tags(input.approve_tags);
        if (selected.some(tag => !current.suggested_tags.includes(tag))) throw new HttpError(400, '추천 목록에 없는 태그입니다.');
        fields.push('tags_json = ?', 'suggested_tags_json = ?');
        values.push(JSON.stringify(tags([...new Set([...current.tags, ...selected])])), JSON.stringify(current.suggested_tags.filter((tag: string) => !selected.includes(tag))));
      }
      if (!fields.length) throw new HttpError(400, '수정할 항목이 없습니다.');
      const result = await env.DB.prepare(`UPDATE documents SET ${fields.join(', ')}, version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND version = ? RETURNING id`)
        .bind(...values, id, Number(input.version)).all();
      if (!result.results.length) { await getDocument(id, env); throw new HttpError(409, '문서가 변경되었습니다. 다시 열고 수정하세요.'); }
      return json(await getDocument(id, env));
    }
    throw new HttpError(405, '허용되지 않는 요청입니다.');
  }
  if (url.pathname !== '/api/documents') throw new HttpError(404, '경로를 찾을 수 없습니다.');
  if (request.method === 'GET') {
    const location = url.searchParams.get('location') || 'inbox';
    if (!['inbox', 'later', 'archive', 'all'].includes(location)) throw new HttpError(400, '잘못된 위치입니다.');
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, '잘못된 페이지입니다.');
    const tag = url.searchParams.get('tag') || '';
    const rows = await env.DB.prepare(`SELECT id, normalized_url, title, tags_json, location, is_read, summary_json,
      suggested_tags_json, ai_status, extraction_status, version, created_at, updated_at FROM documents WHERE (? = 'all' OR location = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?))
      ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`).bind(location, location, tag, tag, offset).all<Row>();
    return json({ documents: rows.results.slice(0, 50).map(serialize), next_offset: rows.results.length > 50 ? offset + 50 : null });
  }
  if (request.method !== 'POST') throw new HttpError(405, '허용되지 않는 요청입니다.');
  const input = await readJson(request);
  let normalized: string;
  try {
    normalized = normalizeUrl(text(input.url, 'URL', 4000));
    const url = new URL(normalized);
    if (url.username || url.password) throw new Error();
  } catch { throw new HttpError(400, '사용자 정보가 없는 HTTP(S) URL을 입력하세요.'); }
  const title = input.title === undefined ? normalized : text(input.title, '제목', 500);
  const body = input.body === undefined ? '' : text(input.body, '본문', 100_000);
  const tagNames = tags(input.tags ?? []);
  const id = crypto.randomUUID();
  const inserted = await env.DB.prepare(`INSERT INTO documents(id, normalized_url, title, body, tags_json, extraction_status)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(normalized_url) DO NOTHING RETURNING id`)
    .bind(id, normalized, title, body, JSON.stringify(tagNames), body ? 'provided' : 'pending').all();
  const row = await env.DB.prepare('SELECT * FROM documents WHERE normalized_url = ?').bind(normalized).first<Row>();
  if (inserted.results.length) ctx.waitUntil(body ? enrichDocument(id, env) : extractDocument(id, env));
  return json(serialize(row!), inserted.results.length ? 201 : 200);
}
