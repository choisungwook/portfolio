import type { Env } from '../index';
import { enrichDocument } from '../ai';
import { fetchHtml } from './fetch';
import { extractHtml } from './html';

export async function extractDocument(id: string, env: Env): Promise<void> {
  try {
    const document = await env.DB.prepare("SELECT normalized_url FROM documents WHERE id = ? AND extraction_status = 'pending'")
      .bind(id).first<{ normalized_url: string }>();
    if (!document) return;
    const extracted = extractHtml(await fetchHtml(document.normalized_url));
    await env.DB.prepare(`UPDATE documents SET body = ?, title = CASE WHEN title = normalized_url AND ? != '' THEN ? ELSE title END,
      extraction_status = 'done', version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND extraction_status = 'pending'`).bind(extracted.body, extracted.title, extracted.title, id).run();
  } catch {
    try {
      await env.DB.prepare(`UPDATE documents SET extraction_status = 'failed', version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND extraction_status = 'pending'`).bind(id).run();
    } catch { return; }
  }
  await enrichDocument(id, env);
}
