import type { Db } from './open.ts'

export interface Wait { from: number; to: number | null; kind: 'approval' | 'auth' }

// Waits for many runs in two queries. Approval waits run from a permission request to its decision.
// Auth waits run from a needs_auth stop to the task's next run start.
export function waitsForRuns(db: Db, runIds: string[]): Map<string, Wait[]> {
  const out = new Map<string, Wait[]>()
  if (runIds.length === 0) return out
  const ids = JSON.stringify(runIds)
  const add = (runId: string, wait: Wait) => {
    const list = out.get(runId) ?? []
    list.push(wait)
    out.set(runId, list)
  }
  const approvals = db.prepare(`SELECT p.run_id, p.ts AS from_ts, (
      SELECT d.ts FROM events d WHERE d.run_id = p.run_id AND d.kind IN ('approved', 'denied')
        AND json_extract(d.payload, '$.request_id') = json_extract(p.payload, '$.request_id')
      ORDER BY d.id LIMIT 1) AS to_ts
    FROM events p WHERE p.kind = 'permission_request' AND p.run_id IN (SELECT value FROM json_each(?))
    ORDER BY p.id`).all(ids) as { run_id: string; from_ts: number; to_ts: number | null }[]
  for (const row of approvals) add(row.run_id, { from: row.from_ts, to: row.to_ts, kind: 'approval' })

  const auth = db.prepare(`SELECT r.id AS run_id, r.ended_at AS from_ts, (
      SELECT MIN(n.started_at) FROM runs n WHERE n.task_id = r.task_id AND n.started_at > r.ended_at) AS to_ts
    FROM runs r WHERE r.id IN (SELECT value FROM json_each(?)) AND r.outcome = 'needs_auth' AND r.ended_at IS NOT NULL`)
    .all(ids) as { run_id: string; from_ts: number; to_ts: number | null }[]
  for (const row of auth) add(row.run_id, { from: row.from_ts, to: row.to_ts, kind: 'auth' })
  return out
}
