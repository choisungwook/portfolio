import type { Db } from '../db/open.ts'
import { neighbors, type WikiPage } from '../db/wiki.ts'

// How agents and the UI search the team wiki. Callers import only this interface; hybridSearch is the one
// implementation wired in today. A vector index or an external graph (graphify over the mirrored wiki/ folder) can
// replace it without touching the tools.
export interface WikiHit {
  slug: string
  title: string
  score: number
  snippet: string
  via?: string       // set when the page was found by following a [[link]] from a direct hit
}

export type WikiSearch = (query: string, limit?: number) => WikiHit[]

const MAX_TERMS = 10
const EXPAND_FROM = 5
const LINK_WEIGHT = 0.4

// Terms of two characters or more. Korean stems are often two characters ("검색", "예산"), and the trigram index needs
// three, so shorter terms fall back to LIKE. The wiki is small enough that scoring in JavaScript costs nothing.
export function termsOf(query: string): string[] {
  const terms = query.toLowerCase().split(/[\s,.;:!?()[\]{}"'`<>|/\\]+/).filter((t) => [...t].length >= 2)
  return [...new Set(terms)].slice(0, MAX_TERMS)
}

// Lexical match (trigram FTS plus LIKE), scored by where and how often each term appears and how many terms a page
// covers, then one hop along [[links]] so a page that only links to the hit still comes up.
export function hybridSearch(db: Db): WikiSearch {
  return (query, limit = 10) => {
    const terms = termsOf(query)
    if (terms.length === 0) return []
    const pages = new Map<string, WikiPage>()
    for (const page of candidates(db, terms)) pages.set(page.slug, page)
    const hits = [...pages.values()]
      .map((page) => ({ page, score: scoreOf(page, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
    const result: WikiHit[] = hits.map(({ page, score }) => ({ slug: page.slug, title: page.title, score, snippet: snippetOf(page.body, terms) }))
    const seen = new Set(result.map((hit) => hit.slug))
    const top = new Map(result.slice(0, EXPAND_FROM).map((hit) => [hit.slug, hit.score]))
    for (const { slug, via } of neighbors(db, [...top.keys()])) {
      if (seen.has(slug)) continue
      const page = db.prepare('SELECT * FROM wiki_pages WHERE slug = ?').get(slug) as WikiPage | undefined
      if (!page) continue
      seen.add(slug)
      result.push({ slug, title: page.title, score: (top.get(via) ?? 0) * LINK_WEIGHT, snippet: page.body.slice(0, 120), via })
    }
    return result.sort((a, b) => b.score - a.score).slice(0, limit).map((hit) => ({ ...hit, score: Math.round(hit.score * 100) / 100 }))
  }
}

function candidates(db: Db, terms: string[]): WikiPage[] {
  const found: WikiPage[] = []
  const long = terms.filter((t) => [...t].length >= 3)
  if (long.length > 0) {
    const match = long.map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ')
    found.push(...db.prepare(`SELECT p.* FROM wiki_fts f JOIN wiki_pages p ON p.slug = f.slug WHERE wiki_fts MATCH ? LIMIT 200`)
      .all(match) as unknown as WikiPage[])
  }
  for (const term of terms.filter((t) => [...t].length < 3)) {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    found.push(...db.prepare(`SELECT * FROM wiki_pages WHERE lower(title) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\' LIMIT 200`)
      .all(like, like) as unknown as WikiPage[])
  }
  return found
}

function occurrences(text: string, term: string): number {
  let count = 0
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) count += 1
  return count
}

export function scoreOf(page: Pick<WikiPage, 'slug' | 'title' | 'body'>, terms: string[]): number {
  const title = `${page.title} ${page.slug}`.toLowerCase()
  const body = page.body.toLowerCase()
  let score = 0
  let covered = 0
  for (const term of terms) {
    const inTitle = title.includes(term)
    const inBody = occurrences(body, term)
    if (!inTitle && inBody === 0) continue
    covered += 1
    score += (inTitle ? 3 : 0) + (inBody > 0 ? 1 + Math.log2(inBody) : 0)
  }
  return score * (0.5 + covered / terms.length)
}

function snippetOf(body: string, terms: string[]): string {
  const lower = body.toLowerCase()
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER)
  if (at === Number.MAX_SAFE_INTEGER) return body.slice(0, 120)
  const start = Math.max(0, at - 50)
  return `${start > 0 ? '...' : ''}${body.slice(start, at + 90)}${at + 90 < body.length ? '...' : ''}`
}
