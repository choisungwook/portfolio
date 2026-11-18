import { createHash } from 'node:crypto'
import { basename, dirname, extname, posix } from 'node:path'

// Turns imported files into wiki pages bots can search and follow, instead of storing an archive they cannot read:
// - a page per document, titled by its first heading, with a line saying where it came from;
// - a long markdown document split at its `## ` headings into section pages, linked from the document's page;
// - relative links between imported documents rewritten to [[slug]] links, so the wiki's link graph has them;
// - code and data files wrapped in a fenced block under their file name;
// - binary files (a NUL byte in the first 8 KB) and unknown formats skipped and counted.
// A taskq wiki export (wiki/<slug>.md with a slug in its front matter) is restored under its own slugs.

export interface SourceFile {
  path: string          // relative to the import root, with / separators
  data: Buffer
}

export interface PageDraft {
  slug: string
  title: string
  body: string
  source: string
}

const TEXT = new Set(['.md', '.markdown', '.mdx', '.txt', '.rst', '.adoc', '.org'])
const HTML = new Set(['.html', '.htm'])
const CODE: Record<string, string> = {
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.csv': 'csv', '.tsv': 'tsv', '.xml': 'xml', '.ini': 'ini',
  '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
  '.sh': 'bash', '.sql': 'sql', '.tf': 'hcl', '.rb': 'ruby', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cs': 'csharp', '.swift': 'swift',
}
const HEAD_LIMIT = 4000
export const PAGE_LIMIT = 18_000      // under the wiki's 20,000-character body limit, leaving room for the source line
const SPLIT_AT = 12_000               // a markdown document longer than this is split at its ## headings

export function slugPart(text: string, fallbackSeed: string): string {
  const ascii = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return ascii || `doc-${createHash('sha1').update(fallbackSeed).digest('hex').slice(0, 8)}`
}

function isBinary(data: Buffer): boolean {
  return data.subarray(0, 8192).includes(0)
}

function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (_m, n) => `${'#'.repeat(Number(n))} `).replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim()
}

function titleOf(text: string, path: string): string {
  const heading = /^#\s+(.+)$/m.exec(text)
  return (heading?.[1] ?? basename(path, extname(path))).trim().slice(0, 200)
}

// Cuts text into pieces of at most `limit` characters at paragraph breaks (or hard, for one huge paragraph).
function chunks(text: string, limit: number): string[] {
  const out: string[] = []
  let current = ''
  for (const para of text.split(/\n{2,}/)) {
    const piece = para.length > limit ? para.match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g')) ?? [] : [para]
    for (const part of piece) {
      if (current && current.length + part.length + 2 > limit) {
        out.push(current)
        current = ''
      }
      current = current ? `${current}\n\n${part}` : part
    }
  }
  if (current) out.push(current)
  return out
}

function splitSections(text: string): { heading: string; body: string }[] {
  const parts = text.split(/^(?=##\s)/m)
  return parts.map((part) => ({ heading: /^##\s+(.+)$/m.exec(part)?.[1]?.trim() ?? '', body: part.trim() })).filter((p) => p.body)
}

export interface ExportedPage {
  slug: string
  title: string
  body: string
}

// A file of a taskq wiki export: front matter with slug and title, then the body.
export function parseExported(file: SourceFile): ExportedPage | undefined {
  if (!/^wiki\/.+\.md$/.test(file.path)) return undefined
  const text = file.data.toString('utf8')
  const match = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(text)
  if (!match) return undefined
  const field = (name: string) => {
    const line = new RegExp(`^${name}: (.*)$`, 'm').exec(match[1])?.[1]
    if (line === undefined) return undefined
    try {
      return String(JSON.parse(line))
    } catch {
      return line
    }
  }
  const slug = field('slug')
  if (!slug) return undefined
  return { slug, title: field('title') ?? slug, body: match[2].replace(/\n$/, '') }
}

// Slugs for every importable file, decided before any page is written, so links between them can be rewritten.
// `index` is the import's own index page. Pages taskq derives from a document (sections, parts) use `--`, which a file
// slug never contains (slugPart collapses hyphens), so they cannot collide with another file's slug.
export function planSlugs(files: SourceFile[], prefix: string): Map<string, string> {
  const used = new Set<string>([`${prefix}/index`])
  const out = new Map<string, string>()
  for (const file of files) {
    const base = slugPart(file.path.replace(/\.[^./]+$/, '').replaceAll('/', '-'), file.path)
    let slug = `${prefix}/${base}`
    for (let n = 2; used.has(slug); n += 1) slug = `${prefix}/${base}-${n}`
    used.add(slug)
    out.set(file.path, slug)
  }
  return out
}

export function digestFile(file: SourceFile, slugs: Map<string, string>, when: string): PageDraft[] | 'skipped' {
  const ext = extname(file.path).toLowerCase()
  const slug = slugs.get(file.path)
  if (!slug || isBinary(file.data)) return 'skipped'
  let text: string
  if (TEXT.has(ext)) text = file.data.toString('utf8')
  else if (HTML.has(ext)) text = htmlToText(file.data.toString('utf8'))
  else if (CODE[ext]) text = `# ${basename(file.path)}\n\n\`\`\`${CODE[ext]}\n${file.data.toString('utf8').replace(/```/g, '`​``')}\n\`\`\``
  else return 'skipped'
  // [label](other.md) to another imported document becomes [[its-slug]].
  const here = dirname(file.path)
  text = text.replace(/\[([^\]]+)\]\(([^)\s#]+)(#[^)]*)?\)/g, (whole, label: string, target: string) => {
    if (/^[a-z]+:/i.test(target)) return whole
    let decoded = target
    try {
      decoded = decodeURIComponent(target)
    } catch {
      // A stray % (50%.md) is a literal character, not an escape.
    }
    const other = slugs.get(posix.normalize(posix.join(here, decoded)))
    return other ? `${label} ([[${other}]])` : whole
  })
  const title = titleOf(text, file.path)
  const origin = `> Imported from \`${file.path}\` on ${when}.`
  if (text.length <= SPLIT_AT || ![TEXT, HTML].some((set) => set.has(ext))) {
    const pieces = chunks(text, PAGE_LIMIT)
    if (pieces.length === 1) return [{ slug, title, body: `${origin}\n\n${text}`, source: file.path }]
    const parts = pieces.map((piece, i) => ({ slug: `${slug}--p${i + 1}`, title: `${title} (${i + 1}/${pieces.length})`, body: `${origin}\n\n${piece}`, source: file.path }))
    return [{ slug, title, body: `${origin}\n\nThis document is split into ${parts.length} pages:\n\n${parts.map((p) => `- [[${p.slug}]]`).join('\n')}`, source: file.path }, ...parts]
  }
  const sections = splitSections(text)
  const intro = sections[0]?.heading ? '' : sections.shift()?.body ?? ''
  // No ## headings to split at: the document is cut into parts by length instead, so nothing is dropped.
  if (sections.length === 0) {
    const pieces = chunks(text, PAGE_LIMIT)
    const parts = pieces.map((piece, i) => ({ slug: `${slug}--p${i + 1}`, title: `${title} (${i + 1}/${pieces.length})`, body: `${origin}\n\n${piece}`, source: file.path }))
    return [{ slug, title, body: `${origin}\n\nThis document is split into ${parts.length} pages:\n\n${parts.map((p) => `- [[${p.slug}]]`).join('\n')}`, source: file.path }, ...parts]
  }
  const pages: PageDraft[] = []
  // The document page keeps the start of the text before the first ## heading; the rest of it becomes its own parts,
  // linked first.
  const [head = '', ...afterHead] = chunks(intro, HEAD_LIMIT)
  const introPieces = afterHead.length > 0 ? chunks(afterHead.join('\n\n'), PAGE_LIMIT) : []
  introPieces.forEach((piece, i) => {
    pages.push({ slug: `${slug}--p${i + 2}`, title: `${title} (intro ${i + 2}/${introPieces.length + 1})`, body: `${origin} Part of [[${slug}]].\n\n${piece}`, source: file.path })
  })
  sections.forEach((section, i) => {
    const pieces = chunks(section.body, PAGE_LIMIT)
    pieces.forEach((piece, j) => {
      pages.push({
        slug: `${slug}--s${i + 1}${pieces.length > 1 ? `-${j + 1}` : ''}`,
        title: `${title}: ${section.heading || `part ${i + 1}`}${pieces.length > 1 ? ` (${j + 1}/${pieces.length})` : ''}`,
        body: `${origin} Part of [[${slug}]].\n\n${piece}`, source: file.path,
      })
    })
  })
  // The document page holds the start of the intro and the section list; a list too long for one page is cut at a whole
  // line and points to the import's index page, which lists every page.
  const lines = pages.map((p) => `- ${p.title.slice(title.length + 2) || p.title} [[${p.slug}]]`)
  let toc = ''
  for (const line of lines) {
    if (origin.length + head.length + toc.length + line.length + 200 > PAGE_LIMIT) {
      toc += '- … the rest are listed on the import\'s index page\n'
      break
    }
    toc += `${line}\n`
  }
  return [{ slug, title, body: `${origin}\n\n${head}\n\n## Sections\n\n${toc}`, source: file.path }, ...pages]
}
