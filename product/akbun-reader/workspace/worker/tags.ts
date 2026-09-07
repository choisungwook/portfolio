import type { Env } from './index';
import { HttpError, json, readJson, text } from './http';

const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const hasTag = 'EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = ?)';

export async function listTags(env: Env, query = '') {
  const rows = await env.DB.prepare(`SELECT j.value AS name, count(DISTINCT documents.id) AS count
    FROM documents, json_each(tags_json) j WHERE ? = '' OR instr(lower(j.value), lower(?)) > 0 GROUP BY j.value ORDER BY j.value`)
    .bind(query, query).all();
  return { tags: rows.results };
}

export async function tagExists(name: string, env: Env): Promise<boolean> {
  return Boolean(await env.DB.prepare(`SELECT 1 FROM documents WHERE ${hasTag} LIMIT 1`).bind(name).first());
}

export function tagName(value: unknown): string {
  return text(value, '태그', 80).normalize('NFC');
}

export async function tags(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/tags' && request.method === 'GET') return json(await listTags(env, url.searchParams.get('q')?.trim() ?? ''));
  const match = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (!match) throw new HttpError(404, '경로를 찾을 수 없습니다.');
  let name: string;
  try { name = tagName(decodeURIComponent(match[1])); } catch { throw new HttpError(400, '잘못된 태그입니다.'); }
  if (!await tagExists(name, env)) throw new HttpError(404, '태그를 찾을 수 없습니다.');
  if (request.method === 'PATCH') {
    const input = await readJson(request);
    const next = tagName(input.name);
    if (next === name) return json({ name, renamed: false });
    await env.DB.batch([
      env.DB.prepare(`UPDATE documents SET tags_json = (SELECT json_group_array(value) FROM (SELECT DISTINCT CASE WHEN value = ? THEN ? ELSE value END AS value
        FROM json_each(documents.tags_json))), version = version + 1, updated_at = ${now} WHERE ${hasTag}`).bind(name, next, name),
      env.DB.prepare(`UPDATE shares SET target = ? WHERE kind = 'tag' AND target = ?
        AND NOT EXISTS (SELECT 1 FROM shares WHERE kind = 'tag' AND target = ?)`).bind(next, name, next),
      env.DB.prepare("DELETE FROM shares WHERE kind = 'tag' AND target = ?").bind(name),
    ]);
    return json({ name: next, renamed: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE documents SET tags_json = (SELECT json_group_array(value) FROM json_each(documents.tags_json) WHERE value != ?),
        version = version + 1, updated_at = ${now} WHERE ${hasTag}`).bind(name, name),
      env.DB.prepare("DELETE FROM shares WHERE kind = 'tag' AND target = ?").bind(name),
    ]);
    return json({ deleted: true });
  }
  throw new HttpError(405, '허용되지 않는 요청입니다.');
}
