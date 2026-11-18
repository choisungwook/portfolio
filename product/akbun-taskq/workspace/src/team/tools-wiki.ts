import { z } from 'zod'
import { getPage, linksOf, listPages, neighbors, writePage } from '../db/wiki.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'
import { mirrorPage } from './wiki-files.ts'

export function wikiTools(scope: ScopedTools): TeamTool[] {
  const { db, config, agent, search, wrote } = scope
  return [
    {
      name: 'wiki_list',
      description: 'List every page of the shared team wiki: slug, title, revision, last author.',
      input: {},
      readOnly: true,
      handler: () => ({ pages: listPages(db) }),
    },
    {
      name: 'wiki_search',
      description: 'Search the shared team wiki. Matches any part of a word (Korean particles included), ranks by title and body hits and how many terms match, and also returns pages linked by [[slug]] to the best hits (marked via). Search before you write a new page.',
      input: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(30).optional() },
      readOnly: true,
      handler: (args) => ({ results: search(String(args.query), (args.limit as number | undefined) ?? 10) }),
    },
    {
      name: 'wiki_read',
      description: 'Read a wiki page with the pages it links to and the pages linking to it. Note its revision: wiki_write needs it.',
      input: { slug: z.string().max(250) },
      readOnly: true,
      handler(args) {
        const page = getPage(db, String(args.slug))
        if (!page) throw new ToolError('no such page; base_revision 0 creates it')
        const links = linksOf(page.body)
        const backlinks = neighbors(db, [page.slug]).map((n) => n.slug).filter((slug) => !links.includes(slug))
        return { ...page, links, backlinks }
      },
    },
    {
      name: 'wiki_write',
      description: 'Create or replace a wiki page. base_revision is the revision you read (0 for a new page). If someone wrote in between, you get the current text back: merge and retry. Write facts and decisions that outlive this conversation, with where they came from. Link related pages as [[slug]] so search can follow them.',
      input: {
        slug: z.string().max(250),
        title: z.string().max(200),
        body: z.string().max(20_000),
        base_revision: z.number().int().min(0),
      },
      readOnly: false,
      handler(args) {
        const result = writePage(db, {
          slug: String(args.slug), title: String(args.title), body: String(args.body), author: agent, base_revision: Number(args.base_revision),
        })
        if (!result.ok) throw new ToolError(JSON.stringify({ error: result.error, current: result.current ?? null }))
        wrote()
        mirrorPage(config, getPage(db, String(args.slug))!)
        return { revision: result.revision }
      },
    },
  ]
}
