import type { Env } from './index';
import { HttpError, json, readJson, tags, text } from './http';
import { normalizeUrl } from './lib/normalize-url.js';
import { extractHtml } from './extraction/html';
import { getDocument } from './documents';

export async function importDocument(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'POST 요청이 필요합니다.');
  const input = await readJson(request);
  let url: string;
  try {
    url = normalizeUrl(text(input.url, 'URL', 4000));
    const parsed = new URL(url);
    if (parsed.username || parsed.password) throw new Error();
  } catch { throw new HttpError(400, '올바른 HTTP(S) URL이 필요합니다.'); }
  const title = text(input.title, '제목', 500);
  const names = tags(input.tags ?? []);
  const location = input.location;
  if (!['inbox', 'later', 'archive'].includes(String(location))) throw new HttpError(400, '잘못된 위치입니다.');
  if (typeof input.saved_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.saved_at) || !Number.isFinite(Date.parse(input.saved_at))) {
    throw new HttpError(400, '시간대가 포함된 ISO 저장일이 필요합니다.');
  }
  const saved = new Date(input.saved_at).toISOString();
  const raw = input.body === '' || input.body === undefined ? '' : text(input.body, '본문', 100000);
  if (input.format !== 'markdown' && input.format !== 'html') throw new HttpError(400, '본문 형식은 markdown 또는 html입니다.');
  let body = raw;
  if (raw && input.format === 'html') {
    try { body = extractHtml(raw).body; } catch { throw new HttpError(400, 'HTML에서 본문을 추출하지 못했습니다.'); }
  }
  const existing = await env.DB.prepare('SELECT id FROM documents WHERE normalized_url = ?').bind(url).first<{id: string}>();
  if (existing) return json({ status: 'existing', document: await getDocument(existing.id, env) });
  const id = crypto.randomUUID();
  const inserted = await env.DB.prepare(`INSERT INTO documents(id, normalized_url, title, body, tags_json, location, created_at, extraction_status, ai_status, import_day)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'skipped', date('now')
    WHERE (SELECT count(*) FROM documents WHERE import_day = date('now')) < 3000
    ON CONFLICT(normalized_url) DO NOTHING RETURNING id`)
    .bind(id, url, title, body, JSON.stringify(names), location, saved, body ? 'provided' : 'unavailable').all();
  const current = await env.DB.prepare('SELECT id FROM documents WHERE normalized_url = ?').bind(url).first<{id: string}>();
  if (!current) throw new HttpError(429, '일일 import 3,000건 상한입니다. 다음 UTC 날짜에 재실행하세요.');
  return json({ status: inserted.results.length ? 'imported' : 'existing', document: await getDocument(current.id, env) }, inserted.results.length ? 201 : 200);
}
