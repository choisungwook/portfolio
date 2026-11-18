import type { Db } from './open.ts'
import { termsOf } from '../team/search.ts'

export interface MessageHit {
  id: number
  sender: string
  recipient: string
  created_at: number
  snippet: string
}

const LIMIT = 100

// Every term must match (AND), so adding a word narrows the result. Terms of three characters or more use the trigram
// index (any substring, Korean particles included); shorter ones use LIKE on the rows the index already narrowed, or on
// the whole table when every term is short. A two-letter Latin term matches as a whole word only, as in the wiki search.
export function searchMessages(db: Db, query: string): MessageHit[] {
  const terms = termsOf(query)
  if (terms.length === 0) return []
  const long = terms.filter((t) => [...t].length >= 3)
  const short = terms.filter((t) => [...t].length < 3)
  const where: string[] = []
  const binds: string[] = []
  if (long.length) {
    where.push('m.id IN (SELECT rowid FROM team_messages_fts WHERE team_messages_fts MATCH ?)')
    binds.push(long.map((t) => `"${t.replaceAll('"', '""')}"`).join(' AND '))
  }
  for (const term of short) {
    where.push(`lower(m.body) LIKE ? ESCAPE '\\'`)
    binds.push(`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  }
  const rows = db.prepare(`SELECT m.id, m.sender, m.recipient, m.created_at, m.body FROM team_messages m
    WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ${LIMIT * 2}`).all(...binds) as { id: number; sender: string; recipient: string; created_at: number; body: string }[]
  const word = (t: string) => new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`)
  return rows
    .filter((row) => short.every((t) => !/^[a-z0-9]{1,2}$/.test(t) || word(t).test(row.body.toLowerCase())))
    .slice(0, LIMIT)
    .map(({ body, ...row }) => ({ ...row, snippet: snippetOf(body, terms) }))
}

function snippetOf(body: string, terms: string[]): string {
  const lower = body.toLowerCase()
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), body.length)
  const start = Math.max(0, at - 40)
  return `${start > 0 ? '…' : ''}${body.slice(start, at + 100).replaceAll('\n', ' ')}${at + 100 < body.length ? '…' : ''}`
}
