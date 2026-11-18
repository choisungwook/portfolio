import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { getPage, linksOf, writePage, type WikiPage } from '../db/wiki.ts'
import { postMessage, SYSTEM, ORCHESTRATOR } from '../db/team.ts'
import { resolveShared, sharedDir } from '../team/shared.ts'
import { mirrorPage } from '../team/wiki-files.ts'
import type { JobContext, JobHandler } from '../jobs/runner.ts'
import { readZip, writeZip } from '../util/zip.ts'
import { digestFile, parseExported, planSlugs, slugPart, type SourceFile } from './digest.ts'

// Wiki export and import as background jobs (src/jobs/runner.ts).
// Export: every page as markdown with front matter plus manifest.json, in a zip deflated at level 9, saved under
//   shared/exports/ so it can be downloaded from the shared folder.
// Import: a zip (a taskq export or any documents) or a folder. Files are digested into pages (digest.ts) one by one;
//   the checkpoint is the index of the next file and the pages written so far, so Resume continues after a cancel,
//   a failure or a restart. The last step writes an index page linking every imported page and tells the bots.

const AUTHOR = 'import'
const FOLDER_LIMIT = 5000
const FILE_LIMIT = 5 * 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build'])

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
}

export const exportWikiJob: JobHandler = async ({ db, config, step }) => {
  const pages = db.prepare('SELECT * FROM wiki_pages ORDER BY slug').all() as unknown as WikiPage[]
  const entries = []
  for (const [i, page] of pages.entries()) {
    const text = ['---', `slug: ${JSON.stringify(page.slug)}`, `title: ${JSON.stringify(page.title)}`, `revision: ${page.revision}`,
      `updated_by: ${JSON.stringify(page.updated_by)}`, `updated_at: ${new Date(page.updated_at * 1000).toISOString()}`, '---', '', page.body, ''].join('\n')
    entries.push({ name: `wiki/${page.slug}.md`, data: Buffer.from(text, 'utf8') })
    if (i % 50 === 0 && !step({ done: i, total: pages.length, message: `packing ${page.slug}` })) return 'cancelled'
  }
  const manifest = {
    format: 'taskq-wiki', version: 1, exported_at: new Date().toISOString(),
    pages: pages.map((p) => ({ slug: p.slug, title: p.title, revision: p.revision, updated_by: p.updated_by, links: linksOf(p.body) })),
  }
  entries.push({ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) })
  const zip = writeZip(entries)
  const dir = join(sharedDir(config), 'exports')
  mkdirSync(dir, { recursive: true })
  const name = `wiki-${stamp()}.zip`
  writeFileSync(join(dir, `${name}.tmp`), zip)
  renameSync(join(dir, `${name}.tmp`), join(dir, name))
  const raw = entries.reduce((n, e) => n + e.data.length, 0)
  step({ done: pages.length, total: pages.length, message: 'written' })
  return { path: `exports/${name}`, pages: pages.length, bytes: zip.length, raw_bytes: raw }
}

// The import source: a path inside the shared folder (an uploaded zip) or an absolute file or folder on this machine.
export function resolveSource(config: Config, source: string): string | undefined {
  if (isAbsolute(source)) return existsSync(source) ? source : undefined
  const inShared = resolveShared(config, source)
  return inShared && existsSync(inShared) ? inShared : undefined
}

function walk(root: string, dir: string, out: SourceFile[]): void {
  if (out.length >= FOLDER_LIMIT) return
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) walk(root, full, out)
    } else if (stat.isFile() && stat.size <= FILE_LIMIT) {
      out.push({ path: relative(root, full).split('\\').join('/'), data: readFileSync(full) })
      if (out.length >= FOLDER_LIMIT) return
    }
  }
}

export function readSource(path: string): SourceFile[] {
  if (statSync(path).isDirectory()) {
    const files: SourceFile[] = []
    walk(path, path, files)
    return files
  }
  if (path.toLowerCase().endsWith('.zip')) {
    return readZip(readFileSync(path)).map((e) => ({ path: e.name.replace(/^\/+/, ''), data: e.data })).filter((f) => !f.path.split('/').includes('..') && !f.path.startsWith('__MACOSX/'))
  }
  return [{ path: basename(path), data: readFileSync(path) }]
}

interface ImportCheckpoint {
  next: number
  written: { slug: string; title: string; source: string }[]
  skipped: string[]
}

// Writes a page as `import`, as a new revision of whatever is there. A rerun of the same step writes the same text,
// which only adds a revision: the import is safe to resume.
function put(db: Db, config: Config, slug: string, title: string, body: string): void {
  const current = getPage(db, slug)
  if (current && current.body === body && current.title === title) return
  const result = writePage(db, { slug, title, body, author: AUTHOR, base_revision: current?.revision ?? 0 })
  if (!result.ok) throw new Error(`${slug}: ${result.error}`)
  mirrorPage(config, getPage(db, slug)!)
}

export const importWikiJob: JobHandler = async (ctx: JobContext) => {
  const { db, config, job, step } = ctx
  const source = resolveSource(config, String(job.params.source ?? ''))
  if (!source) throw new Error(`no such file or folder: ${job.params.source}`)
  const files = readSource(source)
  const exported = files.map(parseExported)
  const isExport = files.some((f) => f.path === 'manifest.json') && exported.some(Boolean)
  const batch = slugPart(String(job.params.name ?? '') || basename(source).replace(/\.zip$/i, ''), source)
  const prefix = `import/${batch}`
  const slugs = planSlugs(files.filter((_, i) => !exported[i]), prefix)
  const when = new Date().toISOString().slice(0, 10)
  const cp: ImportCheckpoint = { next: 0, written: [], skipped: [], ...(job.checkpoint as Partial<ImportCheckpoint> | null) }
  for (let i = cp.next; i < files.length; i += 1) {
    const file = files[i]
    const page = exported[i]
    if (page) {
      put(db, config, page.slug, page.title, page.body)
      cp.written.push({ slug: page.slug, title: page.title, source: file.path })
    } else if (file.path !== 'manifest.json' || !isExport) {
      const drafts = digestFile(file, slugs, when)
      if (drafts === 'skipped') cp.skipped.push(file.path)
      else {
        for (const draft of drafts) put(db, config, draft.slug, draft.title, draft.body)
        cp.written.push(...drafts.map((d) => ({ slug: d.slug, title: d.title, source: d.source })))
      }
    }
    cp.next = i + 1
    if (!step({ done: cp.next, total: files.length, checkpoint: cp, message: file.path })) return 'cancelled'
  }
  // A taskq export restores its own pages; anything else gets an index page bots can start from.
  let index: string | null = null
  if (!isExport && cp.written.length) {
    index = `${prefix}/index`
    const lines = [`Imported from \`${basename(source)}\` on ${when}: ${cp.written.length} pages from ${files.length - cp.skipped.length} files.`, '']
    for (const w of cp.written) lines.push(`- ${w.title} [[${w.slug}]]`)
    if (cp.skipped.length) lines.push('', `Skipped (binary or unknown format): ${cp.skipped.slice(0, 50).join(', ')}${cp.skipped.length > 50 ? ', …' : ''}`)
    put(db, config, index, `Import: ${basename(source)}`, lines.join('\n').slice(0, 19_000))
  }
  const note = postMessage(db, {
    sender: SYSTEM, recipient: ORCHESTRATOR,
    body: `The user imported ${cp.written.length} wiki pages${index ? `; start at [[${index}]]` : ' (a taskq wiki export)'}. Search them with wiki_search.`,
  })
  db.prepare('UPDATE team_messages SET read_at = created_at WHERE id = ?').run(note)
  return { pages: cp.written.length, skipped: cp.skipped.length, files: files.length, index, restored_export: isExport }
}
