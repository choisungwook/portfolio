import type { Db } from '../db/open.ts'
import { ftsMatch } from '../db/search.ts'
import type { SimilarTask, Task } from '../types.ts'

const MAX_TERMS = 12

// Finished runs whose intent or summary shares a word with this task's intent. Words are quoted and OR-joined.
export function findSimilar(db: Db, task: Task, limit = 3): SimilarTask[] {
  const words = [...new Set(task.data.intent.split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS)
  if (words.length === 0) return []
  const rows = db.prepare(`SELECT task_id, body FROM history_fts
    WHERE history_fts MATCH ? AND task_id != ? ORDER BY rank LIMIT ?`)
    .all(ftsMatch(words.join(' '), ' OR '), task.id, limit) as unknown as { task_id: string; body: string }[]
  return rows.map((row) => ({ task_id: row.task_id, text: row.body.slice(0, 300) }))
}
