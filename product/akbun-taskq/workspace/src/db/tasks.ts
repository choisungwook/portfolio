import type { Db } from './open.ts'
import type { Task, TaskData, TaskStatus, TaskType } from '../types.ts'
import { newId } from '../ids.ts'
import { nowSec } from '../time.ts'
import type { TaskInput } from '../validate.ts'

export interface DepInput { depends_on: string; kind: 'blocks' | 'discovered_from' }

export interface NewTask {
  type: TaskType
  status: TaskStatus
  priority?: number
  lock_key?: string | null
  data: TaskData
  deps?: DepInput[]
}

export type TaskView = Task & { blocked: boolean }

interface TaskRow extends Omit<Task, 'data'> { data: string }

function toTask(row: TaskRow): Task {
  return { ...row, data: JSON.parse(row.data) as TaskData }
}

const BLOCKED_SQL = `EXISTS (SELECT 1 FROM deps d JOIN tasks p ON p.id = d.depends_on
  WHERE d.task_id = t.id AND d.kind = 'blocks' AND p.status != 'done')`

// Title as shown in lists: the task's title, else the first 60 characters of its intent. Needs a `t` alias on tasks.
export const TASK_TITLE_SQL = `COALESCE(NULLIF(json_extract(t.data, '$.title'), ''), substr(json_extract(t.data, '$.intent'), 1, 60)) AS task_title`

export function insertTask(db: Db, input: NewTask): Task {
  const id = newId()
  const now = nowSec()
  const data = JSON.stringify(input.data)
  db.prepare(`INSERT INTO tasks (id, type, status, priority, lock_key, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.type, input.status, input.priority ?? 0, input.lock_key ?? null, data, now, now)
  for (const dep of input.deps ?? []) {
    db.prepare('INSERT INTO deps (task_id, depends_on, kind) VALUES (?, ?, ?)').run(id, dep.depends_on, dep.kind)
  }
  return getTask(db, id)!
}

export function getTask(db: Db, id: string): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  return row ? toTask(row as unknown as TaskRow) : undefined
}

export function listTasks(db: Db, status?: string): TaskView[] {
  const rows = db.prepare(`SELECT t.*, ${BLOCKED_SQL} AS blocked FROM tasks t
    WHERE (? IS NULL OR t.status = ?) ORDER BY t.priority DESC, t.created_at ASC`)
    .all(status ?? null, status ?? null)
  return rows.map((row) => {
    const { blocked, ...rest } = row as unknown as TaskRow & { blocked: number }
    return { ...toTask(rest), blocked: blocked === 1 }
  })
}

export function listDeps(db: Db): { task_id: string; depends_on: string; kind: string }[] {
  return db.prepare('SELECT task_id, depends_on, kind FROM deps').all() as { task_id: string; depends_on: string; kind: string }[]
}

// Ready tasks whose blocks-dependencies are all done and whose lock_key has no active task.
export function nextEligible(db: Db): Task | undefined {
  const row = db.prepare(`SELECT t.* FROM tasks t
    WHERE t.status = 'ready'
      AND NOT ${BLOCKED_SQL}
      AND NOT EXISTS (SELECT 1 FROM tasks o WHERE t.lock_key IS NOT NULL AND o.lock_key = t.lock_key
        AND o.id != t.id AND o.status IN ('running', 'needs_approval', 'needs_auth'))
    ORDER BY t.priority DESC, t.created_at ASC LIMIT 1`).get()
  return row ? toTask(row as unknown as TaskRow) : undefined
}

// The lock_key check and the pause check are part of the UPDATE, so no runner can claim while the queue is paused
// or claim a task that shares a lock_key with a live one.
export function claimTask(db: Db, id: string, runnerId: string): boolean {
  const now = nowSec()
  const result = db.prepare(`UPDATE tasks SET status = 'running', claimed_by = ?, heartbeat_at = ?, updated_at = ?
    WHERE id = ? AND status = 'ready'
      AND NOT EXISTS (SELECT 1 FROM meta WHERE key = 'queue_paused' AND value = '1')
      AND NOT EXISTS (SELECT 1 FROM tasks o WHERE o.id != tasks.id AND o.lock_key IS NOT NULL AND o.lock_key = tasks.lock_key
        AND o.status IN ('running', 'needs_approval', 'needs_auth'))`).run(runnerId, now, now, id)
  return result.changes === 1
}

export function setStatus(db: Db, id: string, status: TaskStatus): void {
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, nowSec(), id)
}

// Ends a run's ownership of the task: clears the claim and the heartbeat. With an owner, only that claim can release.
export function releaseTask(db: Db, id: string, status: TaskStatus, owner?: string): boolean {
  const result = owner === undefined
    ? db.prepare('UPDATE tasks SET status = ?, claimed_by = NULL, heartbeat_at = NULL, updated_at = ? WHERE id = ?').run(status, nowSec(), id)
    : db.prepare('UPDATE tasks SET status = ?, claimed_by = NULL, heartbeat_at = NULL, updated_at = ? WHERE id = ? AND claimed_by = ?')
      .run(status, nowSec(), id, owner)
  return result.changes === 1
}

export function touchHeartbeat(db: Db, id: string, runnerId: string): void {
  db.prepare('UPDATE tasks SET heartbeat_at = ? WHERE id = ? AND claimed_by = ?').run(nowSec(), id, runnerId)
}

export function setSession(db: Db, id: string, sessionId: string): void {
  db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, id)
}

export function patchData(db: Db, id: string, patch: Partial<TaskData>): void {
  const task = getTask(db, id)
  if (!task) throw new Error(`task not found: ${id}`)
  const data = { ...task.data, ...patch }
  db.prepare('UPDATE tasks SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), nowSec(), id)
}

export function setPriority(db: Db, id: string, priority: number): void {
  db.prepare('UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?').run(priority, nowSec(), id)
}

// Tasks whose heartbeat is older than the TTL. A NULL heartbeat is not stale: it is not claimed. At startup (`all`) every running or needs_approval task is returned.
export function staleCandidates(db: Db, cutoff: number, all: boolean): Task[] {
  const rows = db.prepare(`SELECT * FROM tasks WHERE status IN ('running', 'needs_approval')
    AND (? = 1 OR (heartbeat_at IS NOT NULL AND heartbeat_at < ?))`).all(all ? 1 : 0, cutoff)
  return rows.map((row) => toTask(row as unknown as TaskRow))
}

// Creates a task from validated input. Dependencies are blocks-type and must name existing tasks.
export function createFromInput(db: Db, input: TaskInput): Task {
  for (const id of input.depends_on) {
    if (!getTask(db, id)) throw new Error(`unknown dependency: ${id}`)
  }
  return insertTask(db, {
    type: input.type, status: input.status, priority: input.priority, lock_key: input.lock_key, data: input.data,
    deps: input.depends_on.map((depends_on) => ({ depends_on, kind: 'blocks' as const })),
  })
}

// Moves a task only when it is in the expected state. Returns false otherwise.
export function moveStatus(db: Db, id: string, from: TaskStatus, to: TaskStatus): boolean {
  return db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
    .run(to, nowSec(), id, from).changes === 1
}

// One query for every node: blocked flag, the outcome of its latest run, and how many runs ended stale.
export function graphNodes(db: Db) {
  const rows = db.prepare(`SELECT t.id, t.type, t.status, t.data, ${BLOCKED_SQL} AS blocked,
      (SELECT r.outcome FROM runs r WHERE r.task_id = t.id ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1) AS last_outcome,
      (SELECT COUNT(*) FROM runs r WHERE r.task_id = t.id AND r.outcome = 'stale') AS stale_count
    FROM tasks t ORDER BY t.priority DESC, t.created_at ASC`).all() as unknown as (Omit<TaskRow, 'data'> & {
    data: string; blocked: number; last_outcome: string | null; stale_count: number
  })[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as TaskData
    return {
      id: row.id, type: row.type, status: row.status, blocked: row.blocked === 1,
      title: data.title ?? data.intent, last_outcome: row.last_outcome, stale_count: Number(row.stale_count),
    }
  })
}

export function listLockKeys(db: Db): string[] {
  return (db.prepare('SELECT DISTINCT lock_key FROM tasks WHERE lock_key IS NOT NULL ORDER BY lock_key').all() as { lock_key: string }[])
    .map((row) => row.lock_key)
}
