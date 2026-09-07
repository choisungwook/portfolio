import type { Env } from '../index';
import { HttpError, json, readJson, text } from '../http';
import { normalizeUrl } from '../lib/normalize-url.js';
import { fetchText, publicUrl } from '../extraction/fetch';
import { parseFeed } from './parse';

export const MAX_FEED_BYTES = 512_000;
export const MAX_ITEMS_PER_FEED = 500;
export const FEEDS_PER_CRON = 4;
const feedTypes = ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'application/rdf+xml'];
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function fetchFeed(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  return fetchText(url, { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8', mediaTypes: feedTypes, maxBytes: MAX_FEED_BYTES, fetcher });
}

export async function refreshFeed(id: string, env: Env, fetcher: typeof fetch = fetch): Promise<{ added: number } | null> {
  const feed = await env.DB.prepare('SELECT url, title FROM feeds WHERE id = ?').bind(id).first<{ url: string; title: string }>();
  if (!feed) return null;
  try {
    const parsed = parseFeed(await fetchFeed(feed.url, fetcher), feed.url);
    const fetchedAt = new Date().toISOString();
    const statements = [];
    for (const item of parsed.items) {
      let normalized: string;
      try { normalized = normalizeUrl(item.url); } catch { continue; }
      statements.push(env.DB.prepare(`INSERT INTO feed_items(id, feed_id, guid, normalized_url, title, summary, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(feed_id, guid) DO NOTHING RETURNING id`)
        .bind(crypto.randomUUID(), id, item.guid, normalized, item.title, item.summary, item.published_at ?? fetchedAt));
    }
    statements.push(env.DB.prepare(`UPDATE feeds SET title = CASE WHEN title = url AND ? != '' THEN ? ELSE title END,
      fetch_status = 'done', fetched_at = ${now} WHERE id = ?`).bind(parsed.title, parsed.title, id));
    statements.push(env.DB.prepare(`DELETE FROM feed_items WHERE feed_id = ? AND id NOT IN
      (SELECT id FROM feed_items WHERE feed_id = ? ORDER BY published_at DESC, id DESC LIMIT ?)`).bind(id, id, MAX_ITEMS_PER_FEED));
    const results = await env.DB.batch(statements);
    return { added: results.slice(0, -2).filter(result => result.results.length).length };
  } catch {
    await env.DB.prepare(`UPDATE feeds SET fetch_status = 'failed', fetched_at = ${now} WHERE id = ?`).bind(id).run();
    return { added: 0 };
  }
}

export async function refreshStaleFeeds(env: Env, fetcher: typeof fetch = fetch): Promise<void> {
  const rows = await env.DB.prepare(`SELECT id FROM feeds WHERE fetched_at IS NULL OR fetched_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-55 minutes')
    ORDER BY fetched_at LIMIT ?`).bind(FEEDS_PER_CRON).all<{ id: string }>();
  for (const row of rows.results) await refreshFeed(row.id, env, fetcher);
}

type FeedRow = { id: string; url: string; title: string; fetch_status: string; fetched_at: string | null; created_at: string; item_count: number };
const feedColumns = `id, url, title, fetch_status, fetched_at, created_at, (SELECT count(*) FROM feed_items WHERE feed_id = feeds.id) AS item_count`;

export async function getFeed(id: string, env: Env): Promise<FeedRow> {
  const row = await env.DB.prepare(`SELECT ${feedColumns} FROM feeds WHERE id = ?`).bind(id).first<FeedRow>();
  if (!row) throw new HttpError(404, 'RSS를 찾을 수 없습니다.');
  return row;
}

export async function listFeedItems(env: Env, feedId: string | null, offset: number) {
  const rows = await env.DB.prepare(`SELECT i.id, i.feed_id, f.title AS feed_title, i.normalized_url, i.title, i.summary, i.published_at,
    d.id AS document_id FROM feed_items i JOIN feeds f ON f.id = i.feed_id LEFT JOIN documents d ON d.normalized_url = i.normalized_url
    WHERE (? IS NULL OR i.feed_id = ?) ORDER BY i.published_at DESC, i.id DESC LIMIT 51 OFFSET ?`).bind(feedId, feedId, offset).all();
  return { items: rows.results.slice(0, 50), next_offset: rows.results.length > 50 ? offset + 50 : null };
}

export function pageOffset(url: URL): number {
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, '잘못된 페이지입니다.');
  return offset;
}

export async function feeds(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/feed-items' && request.method === 'GET') {
    return json(await listFeedItems(env, url.searchParams.get('feed') || null, pageOffset(url)));
  }
  if (url.pathname === '/api/feeds' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT ${feedColumns} FROM feeds ORDER BY created_at DESC`).all<FeedRow>();
    return json({ feeds: rows.results });
  }
  if (url.pathname === '/api/feeds' && request.method === 'POST') {
    const input = await readJson(request);
    let address: string;
    try { address = publicUrl(normalizeUrl(text(input.url, 'URL', 4000))).href; }
    catch { throw new HttpError(400, '공개 HTTP(S) RSS 주소를 입력하세요.'); }
    const title = input.title === undefined ? address : text(input.title, '이름', 200);
    const id = crypto.randomUUID();
    const inserted = await env.DB.prepare('INSERT INTO feeds(id, url, title) VALUES (?, ?, ?) ON CONFLICT(url) DO NOTHING RETURNING id')
      .bind(id, address, title).all();
    const row = await env.DB.prepare(`SELECT ${feedColumns} FROM feeds WHERE url = ?`).bind(address).first<FeedRow>();
    if (inserted.results.length) ctx.waitUntil(refreshFeed(id, env));
    return json(row, inserted.results.length ? 201 : 200);
  }
  const match = url.pathname.match(/^\/api\/feeds\/([^/]+)(\/refresh)?$/);
  if (!match) throw new HttpError(404, '경로를 찾을 수 없습니다.');
  const id = match[1];
  if (match[2] && request.method === 'POST') {
    await getFeed(id, env);
    const result = await refreshFeed(id, env);
    return json({ ...await getFeed(id, env), added: result?.added ?? 0 });
  }
  if (!match[2] && request.method === 'GET') return json(await getFeed(id, env));
  if (!match[2] && request.method === 'DELETE') {
    await getFeed(id, env);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM shares WHERE kind = 'feed' AND target = ?").bind(id),
      env.DB.prepare('DELETE FROM feed_items WHERE feed_id = ?').bind(id),
      env.DB.prepare('DELETE FROM feeds WHERE id = ?').bind(id),
    ]);
    return json({ deleted: true });
  }
  throw new HttpError(405, '허용되지 않는 요청입니다.');
}
