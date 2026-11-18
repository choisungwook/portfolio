import { inTransaction, type Db } from './open.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'

// The team's shared memory. Agents read and write pages through tools; every write keeps the previous revision.

export interface WikiPage {
  slug: string
  title: string
  body: string
  revision: number
  updated_by: string
  updated_at: number
}

export type WikiWrite =
  | { ok: true; revision: number }
  | { ok: false; error: string; current?: WikiPage }

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}(\/[a-z0-9][a-z0-9-]{0,79}){0,2}$/
const BODY_LIMIT = 20_000

export function getPage(db: Db, slug: string): WikiPage | undefined {
  return db.prepare('SELECT * FROM wiki_pages WHERE slug = ?').get(slug) as WikiPage | undefined
}

export function listPages(db: Db): Omit<WikiPage, 'body'>[] {
  return db.prepare('SELECT slug, title, revision, updated_by, updated_at FROM wiki_pages ORDER BY slug').all() as unknown as Omit<WikiPage, 'body'>[]
}

const LINK = /\[\[([a-z0-9][a-z0-9/-]{0,249})\]\]/g

// [[slug]] references in a body, the edges search follows.
export function linksOf(body: string): string[] {
  return [...new Set([...body.matchAll(LINK)].map((m) => m[1]).filter((slug) => SLUG_PATTERN.test(slug)))]
}

export function neighbors(db: Db, slugs: string[]): { slug: string; via: string }[] {
  if (slugs.length === 0) return []
  const marks = slugs.map(() => '?').join(', ')
  return db.prepare(`SELECT target AS slug, source AS via FROM wiki_links WHERE source IN (${marks})
    UNION SELECT source AS slug, target AS via FROM wiki_links WHERE target IN (${marks})`)
    .all(...slugs, ...slugs) as { slug: string; via: string }[]
}

// Optimistic concurrency: a writer names the revision it read. Two agents editing one page cannot silently overwrite
// each other; the second gets the current page back and merges. A new page is written with base_revision 0.
export function writePage(db: Db, page: { slug: string; title: string; body: string; author: string; base_revision: number }): WikiWrite {
  if (!SLUG_PATTERN.test(page.slug)) return { ok: false, error: 'slug must be lowercase words joined by hyphens, up to 3 levels separated by /' }
  if (page.body.length > BODY_LIMIT) return { ok: false, error: `body must be at most ${BODY_LIMIT} characters; split the page` }
  const title = mask(page.title.trim().slice(0, 200)) || page.slug
  const body = mask(page.body)
  return inTransaction(db, (): WikiWrite => {
    const current = getPage(db, page.slug)
    const revision = current?.revision ?? 0
    if (revision !== page.base_revision) {
      return { ok: false, error: `page is at revision ${revision}, not ${page.base_revision}; merge with the current text and retry`, current }
    }
    const next = revision + 1
    const now = nowSec()
    db.prepare(`INSERT INTO wiki_pages (slug, title, body, revision, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET title = excluded.title, body = excluded.body, revision = excluded.revision,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .run(page.slug, title, body, next, page.author, now)
    db.prepare('INSERT INTO wiki_revisions (slug, revision, title, body, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(page.slug, next, title, body, page.author, now)
    db.prepare('DELETE FROM wiki_fts WHERE slug = ?').run(page.slug)
    db.prepare('INSERT INTO wiki_fts (slug, title, body) VALUES (?, ?, ?)').run(page.slug, title, body)
    db.prepare('DELETE FROM wiki_links WHERE source = ?').run(page.slug)
    const link = db.prepare('INSERT OR IGNORE INTO wiki_links (source, target) VALUES (?, ?)')
    for (const target of linksOf(body)) if (target !== page.slug) link.run(page.slug, target)
    return { ok: true, revision: next }
  })
}

export function pageHistory(db: Db, slug: string): { revision: number; updated_by: string; updated_at: number }[] {
  return db.prepare('SELECT revision, updated_by, updated_at FROM wiki_revisions WHERE slug = ? ORDER BY revision DESC')
    .all(slug) as { revision: number; updated_by: string; updated_at: number }[]
}
