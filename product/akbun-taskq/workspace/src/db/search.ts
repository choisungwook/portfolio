import type { Db } from './open.ts'
import { TASK_TITLE_SQL } from './tasks.ts'

// Each term is quoted so FTS5 operators in user input are treated as plain text. `joiner` is ' ' (AND) or ' OR '.
// Control characters, NUL included, are stripped from each term first.
export function ftsMatch(text: string, joiner = ' '): string {
  return text.split(/\s+/)
    .map((term) => Array.from(term).filter((char) => char.charCodeAt(0) > 0x1f && char !== '\u007f').join(''))
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(joiner)
}

export function searchHistory(db: Db, query: string) {
  const match = ftsMatch(query)
  if (!match) return []
  return db.prepare(`SELECT history_fts.task_id, history_fts.run_id, snippet(history_fts, 2, '[', ']', '...', 16) AS snippet, ${TASK_TITLE_SQL}
    FROM history_fts LEFT JOIN tasks t ON t.id = history_fts.task_id
    WHERE history_fts MATCH ? ORDER BY history_fts.rank LIMIT 50`).all(match)
}
