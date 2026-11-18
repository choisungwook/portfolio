import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import type { WikiPage } from '../db/wiki.ts'

// The database is the source of truth; TASKQ_HOME/wiki/ is a read-only mirror, one markdown file per page, so tools
// that work on folders (graphify, an editor, grep) can index the team's memory. Edits to the files are not read back.
export function wikiDir(config: Config): string {
  return join(config.home, 'wiki')
}

export function mirrorPage(config: Config, page: WikiPage): void {
  const file = join(wikiDir(config), `${page.slug}.md`)
  mkdirSync(dirname(file), { recursive: true })
  const text = [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    `revision: ${page.revision}`,
    `updated_by: ${page.updated_by}`,
    `updated_at: ${new Date(page.updated_at * 1000).toISOString()}`,
    '---',
    '',
    page.body,
    '',
  ].join('\n')
  // Written to a temporary name first, so an indexer never reads half a page.
  writeFileSync(`${file}.tmp`, text)
  renameSync(`${file}.tmp`, file)
}

export function exportWiki(db: Db, config: Config): number {
  const pages = db.prepare('SELECT * FROM wiki_pages').all() as unknown as WikiPage[]
  for (const page of pages) mirrorPage(config, page)
  return pages.length
}
