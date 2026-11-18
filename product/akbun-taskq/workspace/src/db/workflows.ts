import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { newId } from '../ids.ts'
import { nowSec } from '../time.ts'

// A workflow is a graph of steps a bot executes, the way an n8n workflow is a graph of nodes. taskq does not run the
// steps itself: the bot does the work with its own tools and reports each step. taskq keeps the order (a step starts
// only after the steps it needs), decides whether the run succeeded, and keeps the history the way Argo shows runs.
//
// What "succeeded" means is not the bot's word alone:
// - a `check` step succeeds only with evidence (the command it ran and the output),
// - an `approval` step succeeds only when the user approves it,
// - the run succeeds only when every step succeeded or was skipped, and fails as soon as one step fails.

export type StepKind = 'do' | 'check' | 'handoff' | 'approval'
export const STEP_KINDS: StepKind[] = ['do', 'check', 'handoff', 'approval']
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface WorkflowStep {
  id: string
  name: string
  kind: StepKind
  instructions: string
  needs: string[]       // steps that must succeed (or be skipped) first
  to?: string           // handoff: the bot that gets the work
}

export interface WorkflowDefinition {
  steps: WorkflowStep[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  definition: WorkflowDefinition
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface StepState {
  step_id: string
  status: StepStatus
  output: string | null
  evidence: string | null
  started_at: number | null
  ended_at: number | null
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  workflow_name: string
  workflow_deleted: boolean    // the workflow was deleted after (or while) this run used it; the run keeps its snapshot
  snapshot: WorkflowDefinition
  task_id: string | null
  bot: string
  status: RunStatus
  summary: string | null
  started_at: number
  ended_at: number | null
  steps: StepState[]
}

const STEP_ID = /^[a-z0-9][a-z0-9-]{0,31}$/
const MAX_STEPS = 50
const TEXT_LIMIT = 4000

export function parseDefinition(input: unknown): { ok: true; value: WorkflowDefinition } | { ok: false; error: string } {
  const steps = (input as { steps?: unknown })?.steps
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: 'a workflow needs at least one step' }
  if (steps.length > MAX_STEPS) return { ok: false, error: `a workflow has at most ${MAX_STEPS} steps` }
  const out: WorkflowStep[] = []
  const ids = new Set<string>()
  for (const raw of steps as Record<string, unknown>[]) {
    const id = String(raw?.id ?? '')
    if (!STEP_ID.test(id)) return { ok: false, error: `step id "${id}" must be lowercase letters, digits and hyphens` }
    if (ids.has(id)) return { ok: false, error: `step id "${id}" is used twice` }
    ids.add(id)
    const name = String(raw.name ?? '').trim()
    if (!name || name.length > 120) return { ok: false, error: `step ${id} needs a name of at most 120 characters` }
    const kind = String(raw.kind ?? 'do') as StepKind
    if (!STEP_KINDS.includes(kind)) return { ok: false, error: `step ${id}: kind must be one of ${STEP_KINDS.join(', ')}` }
    const instructions = String(raw.instructions ?? '')
    if (instructions.length > TEXT_LIMIT) return { ok: false, error: `step ${id}: instructions are longer than ${TEXT_LIMIT} characters` }
    const needs = Array.isArray(raw.needs) ? raw.needs.map(String) : []
    const to = raw.to === undefined || raw.to === null || raw.to === '' ? undefined : String(raw.to)
    if (kind === 'handoff' && !to) return { ok: false, error: `step ${id}: a handoff step names the bot it hands work to (to)` }
    out.push({ id, name, kind, instructions, needs: [...new Set(needs)], ...(to ? { to } : {}) })
  }
  for (const step of out) {
    const unknown = step.needs.filter((n) => !ids.has(n))
    if (unknown.length) return { ok: false, error: `step ${step.id} needs unknown step ${unknown.join(', ')}` }
  }
  const cycle = findCycle(out)
  if (cycle) return { ok: false, error: `steps ${cycle.join(' → ')} need each other in a loop` }
  return { ok: true, value: { steps: out } }
}

function findCycle(steps: WorkflowStep[]): string[] | null {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'visiting') return [...path.slice(path.indexOf(id)), id]
    state.set(id, 'visiting')
    path.push(id)
    for (const need of byId.get(id)!.needs) {
      const found = visit(need)
      if (found) return found
    }
    path.pop()
    state.set(id, 'done')
    return null
  }
  for (const step of steps) {
    const found = visit(step.id)
    if (found) return found
  }
  return null
}

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: String(row.id), name: String(row.name), description: String(row.description), definition: JSON.parse(String(row.definition)),
    created_at: Number(row.created_at), updated_at: Number(row.updated_at), deleted_at: row.deleted_at === null ? null : Number(row.deleted_at),
  }
}

export function createWorkflow(db: Db, input: { name: string; description?: string; definition: WorkflowDefinition }): Workflow {
  const now = nowSec()
  const id = newId()
  db.prepare('INSERT INTO workflows (id, name, description, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, input.name, input.description ?? '', JSON.stringify(input.definition), now, now)
  return getWorkflow(db, id)!
}

export function updateWorkflow(db: Db, id: string, input: { name: string; description?: string; definition: WorkflowDefinition }): Workflow | undefined {
  const changed = db.prepare('UPDATE workflows SET name = ?, description = ?, definition = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(input.name, input.description ?? '', JSON.stringify(input.definition), nowSec(), id).changes
  return changed ? getWorkflow(db, id) : undefined
}

// Soft delete: runs keep pointing at the row and show the workflow as deleted. Returns the runs still going, so the
// caller can tell their bots.
export function deleteWorkflow(db: Db, id: string): { deleted: boolean; running: { id: string; bot: string }[] } {
  return inTransaction(db, () => {
    const deleted = db.prepare('UPDATE workflows SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(nowSec(), id).changes === 1
    const running = deleted
      ? db.prepare(`SELECT id, bot FROM workflow_runs WHERE workflow_id = ? AND status = 'running'`).all(id).map((r) => ({ id: String(r.id), bot: String(r.bot) }))
      : []
    return { deleted, running }
  })
}

// By id, or by the name of a workflow that is not deleted.
export function getWorkflow(db: Db, idOrName: string): Workflow | undefined {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(idOrName)
    ?? db.prepare('SELECT * FROM workflows WHERE name = ? AND deleted_at IS NULL').get(idOrName)
  return row ? rowToWorkflow(row) : undefined
}

export function listWorkflows(db: Db, includeDeleted = false): (Workflow & { runs: number; last_status: RunStatus | null })[] {
  const rows = db.prepare(`SELECT w.*, (SELECT count(*) FROM workflow_runs r WHERE r.workflow_id = w.id) AS runs,
      (SELECT status FROM workflow_runs r WHERE r.workflow_id = w.id ORDER BY started_at DESC, rowid DESC LIMIT 1) AS last_status
    FROM workflows w ${includeDeleted ? '' : 'WHERE w.deleted_at IS NULL'} ORDER BY w.deleted_at IS NOT NULL, w.name`).all()
  return rows.map((row) => ({ ...rowToWorkflow(row), runs: Number(row.runs), last_status: (row.last_status ?? null) as RunStatus | null }))
}

export function startRun(db: Db, input: { workflow: Workflow; bot: string; taskId?: string | null }): WorkflowRun {
  return inTransaction(db, () => {
    const id = newId()
    const now = nowSec()
    db.prepare(`INSERT INTO workflow_runs (id, workflow_id, snapshot, task_id, bot, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)`)
      .run(id, input.workflow.id, JSON.stringify(input.workflow.definition), input.taskId ?? null, input.bot, now)
    const insert = db.prepare(`INSERT INTO workflow_steps (run_id, step_id, status) VALUES (?, ?, 'pending')`)
    for (const step of input.workflow.definition.steps) insert.run(id, step.id)
    return getRun(db, id)!
  })
}

export function getRun(db: Db, id: string): WorkflowRun | undefined {
  const row = db.prepare(`SELECT r.*, w.name AS workflow_name, w.deleted_at FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE r.id = ?`).get(id)
  if (!row) return undefined
  const snapshot = JSON.parse(String(row.snapshot)) as WorkflowDefinition
  const order = new Map(snapshot.steps.map((s, i) => [s.id, i]))
  const steps = (db.prepare('SELECT step_id, status, output, evidence, started_at, ended_at FROM workflow_steps WHERE run_id = ?').all(id) as unknown as StepState[])
    .sort((a, b) => (order.get(a.step_id) ?? 0) - (order.get(b.step_id) ?? 0))
  return {
    id: String(row.id), workflow_id: String(row.workflow_id), workflow_name: String(row.workflow_name), workflow_deleted: row.deleted_at !== null,
    snapshot, task_id: row.task_id === null ? null : String(row.task_id), bot: String(row.bot), status: row.status as RunStatus,
    summary: row.summary === null ? null : String(row.summary), started_at: Number(row.started_at), ended_at: row.ended_at === null ? null : Number(row.ended_at),
    steps,
  }
}

export function listRuns(db: Db, filter: { workflowId?: string; bot?: string; taskId?: string; limit?: number } = {}): Omit<WorkflowRun, 'snapshot' | 'steps'>[] {
  const where: string[] = []
  const args: (string | number)[] = []
  if (filter.workflowId) { where.push('r.workflow_id = ?'); args.push(filter.workflowId) }
  if (filter.bot) { where.push('r.bot = ?'); args.push(filter.bot) }
  if (filter.taskId) { where.push('r.task_id = ?'); args.push(filter.taskId) }
  args.push(Math.min(filter.limit ?? 50, 200))
  return db.prepare(`SELECT r.id, r.workflow_id, w.name AS workflow_name, w.deleted_at IS NOT NULL AS workflow_deleted, r.task_id, r.bot, r.status,
      r.summary, r.started_at, r.ended_at FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.started_at DESC, r.rowid DESC LIMIT ?`).all(...args)
    .map((row) => ({ ...row, workflow_deleted: Boolean(row.workflow_deleted) })) as unknown as Omit<WorkflowRun, 'snapshot' | 'steps'>[]
}

export function runningRunForTask(db: Db, taskId: string): WorkflowRun | undefined {
  const row = db.prepare(`SELECT id FROM workflow_runs WHERE task_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`).get(taskId)
  return row ? getRun(db, String(row.id)) : undefined
}

export function latestRunForTask(db: Db, taskId: string): WorkflowRun | undefined {
  const row = db.prepare('SELECT id FROM workflow_runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1').get(taskId)
  return row ? getRun(db, String(row.id)) : undefined
}

const DONE: StepStatus[] = ['succeeded', 'skipped']

// Steps whose needs are all done and that have not started.
export function readySteps(run: WorkflowRun): WorkflowStep[] {
  const status = new Map(run.steps.map((s) => [s.step_id, s.status]))
  return run.snapshot.steps.filter((step) => status.get(step.id) === 'pending' && step.needs.every((n) => DONE.includes(status.get(n)!)))
}

export type StepReport = { status: 'running' | 'succeeded' | 'failed' | 'skipped'; output?: string; evidence?: string }

// A bot reports one step. Refuses what the order or the evidence rules do not allow, with a reason the bot can act on.
export function reportStep(db: Db, runId: string, bot: string, stepId: string, report: StepReport): { ok: true; run: WorkflowRun } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const run = getRun(db, runId)
    if (!run) return { ok: false, error: 'no such workflow run' }
    if (run.bot !== bot) return { ok: false, error: `run ${runId} is executed by ${run.bot}, not you` }
    if (run.status !== 'running') return { ok: false, error: `run ${runId} is ${run.status}` }
    const step = run.snapshot.steps.find((s) => s.id === stepId)
    const state = run.steps.find((s) => s.step_id === stepId)
    if (!step || !state) return { ok: false, error: `run ${runId} has no step ${stepId}` }
    if (state.status !== 'pending' && state.status !== 'running') return { ok: false, error: `step ${stepId} is already ${state.status}` }
    const status = new Map(run.steps.map((s) => [s.step_id, s.status]))
    const waiting = step.needs.filter((n) => !DONE.includes(status.get(n)!))
    if (waiting.length && report.status !== 'skipped') return { ok: false, error: `step ${stepId} needs ${waiting.join(', ')} to finish first` }
    if (report.status === 'succeeded' && step.kind === 'check' && !report.evidence?.trim()) {
      return { ok: false, error: `step ${stepId} is a check: report the command you ran and its output as evidence` }
    }
    if (report.status === 'succeeded' && step.kind === 'approval') return { ok: false, error: `step ${stepId} needs the user's approval; set it running and ask the user` }
    // Skipping would let a check pass without evidence and an approval pass without the user.
    if (report.status === 'skipped' && (step.kind === 'check' || step.kind === 'approval')) return { ok: false, error: `step ${stepId} is a ${step.kind} step and cannot be skipped` }
    if (report.status === 'skipped' && !report.output?.trim()) return { ok: false, error: 'say in output why the step is skipped' }
    const now = nowSec()
    const ended = report.status === 'running' ? null : now
    db.prepare(`UPDATE workflow_steps SET status = ?, output = COALESCE(?, output), evidence = COALESCE(?, evidence),
      started_at = COALESCE(started_at, ?), ended_at = ? WHERE run_id = ? AND step_id = ?`)
      .run(report.status, report.output?.slice(0, TEXT_LIMIT) ?? null, report.evidence?.slice(0, TEXT_LIMIT) ?? null, now, ended, runId, stepId)
    settle(db, runId)
    return { ok: true, run: getRun(db, runId)! }
  })
}

// The user answers an approval step. A rejection fails the step and so the run.
export function answerApproval(db: Db, runId: string, stepId: string, approved: boolean, note: string): { ok: true; run: WorkflowRun } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const run = getRun(db, runId)
    if (!run || run.status !== 'running') return { ok: false, error: 'the run is not running' }
    const step = run.snapshot.steps.find((s) => s.id === stepId)
    const state = run.steps.find((s) => s.step_id === stepId)
    if (!step || step.kind !== 'approval' || !state) return { ok: false, error: 'not an approval step of this run' }
    if (state.status !== 'running' && state.status !== 'pending') return { ok: false, error: `step ${stepId} is already ${state.status}` }
    const now = nowSec()
    db.prepare(`UPDATE workflow_steps SET status = ?, output = ?, started_at = COALESCE(started_at, ?), ended_at = ? WHERE run_id = ? AND step_id = ?`)
      .run(approved ? 'succeeded' : 'failed', `${approved ? 'approved' : 'rejected'} by the user${note ? `: ${note}` : ''}`, now, now, runId, stepId)
    settle(db, runId)
    return { ok: true, run: getRun(db, runId)! }
  })
}

// Ends the run once its outcome is known: any failed step fails it, all steps done succeed it.
function settle(db: Db, runId: string): void {
  const steps = db.prepare('SELECT step_id, status FROM workflow_steps WHERE run_id = ?').all(runId)
  const failed = steps.filter((s) => s.status === 'failed').map((s) => String(s.step_id))
  const done = steps.every((s) => DONE.includes(s.status as StepStatus))
  if (failed.length) endRun(db, runId, 'failed', `step ${failed.join(', ')} failed`)
  else if (done) endRun(db, runId, 'succeeded', `all ${steps.length} steps done`)
}

export function endRun(db: Db, runId: string, status: Exclude<RunStatus, 'running'>, summary: string): boolean {
  const now = nowSec()
  const changed = db.prepare(`UPDATE workflow_runs SET status = ?, summary = ?, ended_at = ? WHERE id = ? AND status = 'running'`).run(status, summary, now, runId).changes === 1
  if (changed && status !== 'succeeded') {
    db.prepare(`UPDATE workflow_steps SET status = 'skipped', output = COALESCE(output, ?), ended_at = ? WHERE run_id = ? AND status IN ('pending', 'running')`)
      .run(`not run: the run ${status}`, now, runId)
  }
  return changed
}

// The step list in words, for a bot's prompt and tool answers.
export function describeRun(run: WorkflowRun): string {
  const status = new Map(run.steps.map((s) => [s.step_id, s]))
  const ready = new Set(readySteps(run).map((s) => s.id))
  const lines = [
    `Workflow run ${run.id} of "${run.workflow_name}"${run.workflow_deleted ? ' (the workflow was deleted; this run continues on its copy)' : ''}: ${run.status}${run.task_id ? `, for task ${run.task_id}` : ''}.`,
    ...run.snapshot.steps.map((step) => {
      const s = status.get(step.id)!
      const tag = s.status === 'pending' && ready.has(step.id) ? 'ready' : s.status
      return `- [${tag}] ${step.id} (${step.kind}${step.to ? ` → ${step.to}` : ''}): ${step.name}${step.needs.length ? `; needs ${step.needs.join(', ')}` : ''}${step.instructions ? `\n  ${step.instructions.replace(/\n/g, '\n  ')}` : ''}${s.output ? `\n  output: ${s.output.slice(0, 300)}` : ''}`
    }),
  ]
  return lines.join('\n')
}
