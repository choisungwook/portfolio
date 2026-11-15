import { randomUUID } from 'node:crypto'
import type { Db } from '../src/db/open.ts'
import type { Config } from '../src/config.ts'
import type { EventKind, Outcome, RunStats, Task, TaskType } from '../src/types.ts'
import { endRun, insertRun } from '../src/db/runs.ts'
import { insertEvent } from '../src/db/events.ts'
import { setSession } from '../src/db/tasks.ts'
import { askApproval } from '../src/runner/approval.ts'
import { newId } from '../src/ids.ts'
import { dayKey, dayStart } from '../src/time.ts'
import { FAKE_SECRET, PENDING_COMMAND, PENDING_REASON, RUN_SPECS, type RunSpec, type RunStart } from './demo-data.ts'

export interface SeededRun { id: string; task: Task; started: number; ended: number | null; requestId?: string }

type Step = [EventKind, Record<string, unknown>]

const COMMANDS: Record<TaskType, [string, string]> = {
  ops_read: [
    'aws ecs describe-services --cluster example-prod-cluster --services example-prod-worker --profile example-prod',
    'aws s3api list-objects-v2 --bucket example-dev-bucket --max-items 50 --profile example-dev',
  ],
  ops_change: [
    'aws ecs describe-services --cluster example-prod-cluster --services example-prod-worker --profile example-prod',
    'aws ecs describe-services --cluster example-dev-cluster --services example-dev-worker --profile example-dev',
  ],
  code: ['rg -n "log.debug" src/', 'npm test -- --reporter=dot'],
  research: ['rg -n "cache" src/', 'wc -l outputs/notes.md'],
  security_review: ['rg -n "token|secret" src/', 'git grep -n "api_key" -- src/'],
}

// Start time of a run. Today's runs are clamped to just after local midnight so they stay on today's date.
function startOf(start: RunStart, now: number): number {
  if ('minAgo' in start) return Math.max(now - start.minAgo * 60, dayStart(dayKey(now)) + 60)
  return dayStart(dayKey(now - start.daysAgo * 86400)) + Math.round(start.hour * 3600)
}

// Invented numbers, scaled by the run length so longer runs cost more.
function statsFor(durMin: number | null): RunStats {
  if (durMin === null) return {}
  const turns = 3 + Math.round(durMin / 8)
  return {
    turns, input_tokens: turns * 14000, output_tokens: turns * 700,
    cost_usd: Number((turns * 0.031).toFixed(3)), tool_calls: turns * 2 - 1,
  }
}

function resultOf(type: TaskType, index: number, flow?: RunSpec['flow']): Record<string, unknown> {
  if (flow === 'secret' && index === 1) return { stdout: `src/config.ts:12: api_key = ${FAKE_SECRET}\nregion = us-east-1` }
  if (type === 'ops_read' || type === 'ops_change') {
    return index === 0
      ? { stdout: 'account 111122223333 (example-prod) desired=4 running=4', arn: 'arn:aws:ecs:us-east-1:111122223333:service/example-prod-cluster/example-prod-worker' }
      : { stdout: 'objects=212 prefixes=3 bytes=48371029' }
  }
  return { stdout: index === 0 ? 'matched 12 lines' : 'tests: 41 passed' }
}

function stepsOf(spec: RunSpec, type: TaskType, requestId: string): Step[] {
  const steps: Step[] = [['claimed', { runner: 'runner-demo', resume: null }]]
  COMMANDS[type].forEach((command, index) => {
    steps.push(['tool_call', { tool: 'Bash', input: { command } }])
    steps.push(['tool_result', resultOf(type, index, spec.flow)])
    if (index === 0 && spec.flow === 'approval') {
      steps.push(['permission_request', {
        request_id: requestId, tool: 'Bash', input: { command: 'npm install --save-dev example-lint-plugin' },
        reason: 'Add a dev dependency for the trim check',
      }])
      steps.push(['approved', { request_id: requestId }])
    }
  })
  if (spec.flow === 'auth') steps.push(['auth_required', { message: 'Login to the example-dev profile expired' }])
  return steps
}

// Event timestamps are spread across the run. insertEvent stamps "now", so the ts column is set afterwards.
function emit(db: Db, task: Task, runId: string, steps: Step[], started: number, ended: number | null): void {
  steps.forEach(([kind, payload], index) => {
    const ts = ended === null
      ? started + index * 60
      : started + Math.round(((ended - started) * (index + 1)) / (steps.length + 1))
    const id = insertEvent(db, { task_id: task.id, run_id: runId, kind, payload })
    db.prepare('UPDATE events SET ts = ? WHERE id = ?').run(ts, id)
  })
}

// Writes every run in RUN_SPECS. The pending run goes through the real approval function and stays open.
export function seedRuns(db: Db, config: Config, tasks: Map<string, Task>, now: number): {
  runs: Map<string, SeededRun>; controller: AbortController
} {
  const runs = new Map<string, SeededRun>()
  const controller = new AbortController()
  for (const spec of RUN_SPECS) {
    const task = tasks.get(spec.task)!
    const started = startOf(spec.start, now)
    const ended = spec.durMin === null ? null : started + spec.durMin * 60
    const id = newId()
    const requestId = randomUUID()
    const sessionId = randomUUID()
    insertRun(db, { id, task_id: task.id, session_id: sessionId, started_at: started })
    setSession(db, task.id, sessionId)
    const steps = stepsOf(spec, task.type, requestId)
    if (ended !== null && spec.outcome !== null) steps.push(['finished', { outcome: spec.outcome }])
    emit(db, task, id, steps, started, ended)
    if (spec.flow === 'pending') {
      askApproval(db, config, task, id, { tool: 'Bash', input: { command: PENDING_COMMAND }, reason: PENDING_REASON }, controller.signal)
        .catch(() => undefined)
    }
    if (ended !== null && spec.outcome !== null) {
      endRun(db, {
        id, task_id: task.id, intent: task.data.intent, outcome: spec.outcome as Outcome,
        summary: spec.summary ?? null, stats: statsFor(spec.durMin), ended_at: ended,
      })
    }
    if (spec.label) runs.set(spec.label, { id, task, started, ended, requestId })
  }
  return { runs, controller }
}
