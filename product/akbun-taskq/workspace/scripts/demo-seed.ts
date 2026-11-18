import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../src/config.ts'
import type { Db } from '../src/db/open.ts'
import type { Task, TaskData } from '../src/types.ts'
import { insertTask } from '../src/db/tasks.ts'
import { insertProposal, setProposalStatus } from '../src/db/proposals.ts'
import { ackAlert } from '../src/db/alerts.ts'
import { pauseQueue } from '../src/db/meta.ts'
import { raiseAlert } from '../src/alerts/rules.ts'
import { registerSkill } from '../src/skills/registry.ts'
import { agentFor } from '../src/agents/index.ts'
import { TASKS } from './demo-data.ts'
import { seedTeam } from './demo-team.ts'
import { seedWorkflows } from './demo-workflows.ts'
import { seedRuns, type SeededRun } from './demo-runs.ts'

type AlertArg = Parameters<typeof raiseAlert>[1]

const quiet = () => undefined

const SKILLS = [
  { name: 'example-readonly', register: true, description: 'Read-only AWS access to the example accounts. Lists and describes only.' },
  { name: 'example-change', register: false, description: 'Scoped change access for the example-dev account. Asks before each change.' },
]

// Writes two skill folders under the temp CLAUDE_CONFIG_DIR. Only example-readonly is registered.
function seedSkills(db: Db, home: string, configDir: string): void {
  for (const skill of SKILLS) {
    const dir = join(configDir, 'skills', skill.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\nDemo skill. It holds no login.\n`)
    if (skill.register) registerSkill(db, home, dir)
  }
}

export function seedTasks(db: Db, home: string, now: number): Map<string, Task> {
  const tasks = new Map<string, Task>()
  for (const spec of TASKS) {
    const data: TaskData = { ...spec.data }
    if (spec.repoName) {
      data.repo = join(home, 'repos', spec.repoName)
      mkdirSync(data.repo, { recursive: true })
    }
    if (spec.reviewOf) data.review_of = tasks.get(spec.reviewOf)!.id
    const task = insertTask(db, {
      type: spec.type, status: spec.status, priority: spec.priority, lock_key: spec.lockKey ?? null, data,
      deps: (spec.deps ?? []).map((dep) => ({ depends_on: tasks.get(dep.on)!.id, kind: dep.kind })),
    })
    const created = now - Math.round(spec.createdDaysAgo * 86400)
    db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?').run(created, created + 3600, task.id)
    tasks.set(spec.key, task)
  }
  return tasks
}

// insertAlert and insertProposal stamp "now". The timestamp is moved to the event it describes afterwards.
function lastId(db: Db, table: 'alerts' | 'proposals'): number {
  return Number(db.prepare(`SELECT MAX(id) AS id FROM ${table}`).get()?.id)
}

function seedProposals(db: Db, tasks: Map<string, Task>, now: number): void {
  const memory = insertProposal(db, {
    task_id: tasks.get('research-cache-options')!.id, kind: 'memory', target_path: 'memory/cache-eviction.md',
    diff: '+ Prefer LRU for the lookup cache until hit-rate data exists.\n',
  })
  db.prepare('UPDATE proposals SET created_at = ? WHERE id = ?').run(now - 3600, memory)
  const skill = insertProposal(db, {
    task_id: tasks.get('ops-read-prod-services')!.id, kind: 'skill', target_path: 'skills/example-readonly/SKILL.md',
    diff: '+ Format service lists as JSON before summarizing.\n',
  })
  db.prepare('UPDATE proposals SET created_at = ? WHERE id = ?').run(now - 2700, skill)
  const applied = insertProposal(db, {
    task_id: tasks.get('research-dashboard-metrics')!.id, kind: 'memory', target_path: 'memory/cost-page.md',
    diff: '+ Cost page metrics come from the billing export.\n',
  })
  db.prepare('UPDATE proposals SET created_at = ? WHERE id = ?').run(now - 2 * 86400, applied)
  setProposalStatus(db, applied, 'applied')
  for (const [key, id] of [['research-cache-options', memory], ['ops-read-prod-services', skill]] as const) {
    raiseAlert(db, { task_id: tasks.get(key)!.id, kind: 'proposal_pending', message: `Proposal ${id} waits for review` }, quiet)
  }
}

// Every kind and every severity the rules produce. Alert times follow the run they describe.
function seedAlerts(db: Db, tasks: Map<string, Task>, runs: Map<string, SeededRun>): void {
  const run = (label: string) => runs.get(label)!
  const when = (label: string) => run(label).ended ?? run(label).started
  const taskId = (key: string) => tasks.get(key)!.id
  const list: [AlertArg, number, boolean][] = [
    [{ task_id: taskId('code-trim-logs'), run_id: run('approval').id, kind: 'approval_required', severity: 'critical',
      ref: run('approval').requestId ?? null, message: 'Approval needed: Bash: npm install --save-dev example-lint-plugin' },
    when('approval'), true],
    [{ task_id: taskId('ops-read-dev-bucket'), run_id: run('auth').id, kind: 'auth_required', severity: 'critical',
      message: 'Login needed: example-dev profile expired' }, when('auth'), true],
    [{ task_id: taskId('code-trim-logs'), run_id: run('finding').id, kind: 'security_finding', severity: 'critical',
      message: 'Security review: a token-shaped value reached a debug line' }, when('finding'), false],
    [{ task_id: taskId('ops-change-alarm-thresholds'), run_id: run('prod-failed').id, kind: 'prod_touch', severity: 'critical',
      message: 'Failed run touched prod lock example-prod-alarms' }, when('prod-failed'), false],
    [{ task_id: taskId('research-dashboard-metrics'), run_id: run('dashboard').id, kind: 'worker_flag', severity: 'critical',
      message: 'Worker tried to write outside outputs. The gate blocked it.' }, when('dashboard'), false],
    [{ task_id: taskId('ops-change-alarm-thresholds'), run_id: run('prod-failed').id, kind: 'failed', severity: 'high',
      message: 'Failed: Alarm API rejected the threshold change' }, when('prod-failed'), false],
    [{ task_id: taskId('security-review-iam'), run_id: run('iam-failed').id, kind: 'failed', severity: 'high',
      message: 'Failed: Review stopped at the policy parser' }, when('iam-failed'), false],
    [{ task_id: taskId('code-trim-logs'), run_id: run('codefail').id, kind: 'failed', severity: 'high',
      message: 'Failed: Tests failed in the export handler mock' }, when('codefail'), false],
    [{ task_id: taskId('security-review-iam'), run_id: run('iam-failed').id, kind: 'worker_flag', severity: 'high',
      message: 'Policy parser fell back to plain text' }, when('iam-failed'), false],
    [{ task_id: taskId('migrate-config-loader'), run_id: run('stale').id, kind: 'stale_repeat', severity: 'high',
      message: 'Stale again: Move config loader to a typed schema' }, when('stale'), false],
    [{ task_id: taskId('research-dashboard-metrics'), run_id: run('budget').id, kind: 'budget_exceeded', severity: 'normal',
      message: 'Budget exceeded: Budget ran out before the dashboard list was complete.' }, when('budget'), true],
    [{ task_id: taskId('research-cache-options'), run_id: run('cache').id, kind: 'review_ready', severity: 'normal',
      message: 'Ready to review: Compare cache eviction options' }, when('cache'), false],
    [{ task_id: taskId('ops-read-dev-bucket'), run_id: run('bucket').id, kind: 'worker_flag', severity: 'normal',
      message: 'Two prefixes skipped due to access denied' }, when('bucket'), false],
  ]
  for (const [alert, at, acked] of list) {
    raiseAlert(db, alert, quiet)
    const id = lastId(db, 'alerts')
    db.prepare('UPDATE alerts SET created_at = ? WHERE id = ?').run(at, id)
    if (acked) ackAlert(db, id)
  }
}

// Same check the runner makes before a claim: a failed preflight pauses the queue and raises the auth alert.
// The demo never starts the runner loop, so this is the only place the pause is set.
async function pauseLikeRunner(db: Db, config: Config): Promise<void> {
  const check = await agentFor(config).preflight(config)
  if (check.ok) throw new Error('demo refuses to run: preflight passed, so a session could start')
  const reason = check.reason ?? 'inference auth failed'
  pauseQueue(db, reason, 'preflight')
  raiseAlert(db, { task_id: null, kind: 'auth_required', message: reason }, quiet)
}

// Seeds everything, then pauses the queue. Returns the controller that ends the one pending approval wait.
export async function seedDemo(db: Db, config: Config, home: string, configDir: string, now: number): Promise<AbortController> {
  seedSkills(db, home, configDir)
  const tasks = seedTasks(db, home, now)
  const { runs, controller } = seedRuns(db, config, tasks, now)
  seedProposals(db, tasks, now)
  seedAlerts(db, tasks, runs)
  const all = [...tasks.values()]
  seedTeam(db, (all.find((t) => t.type === 'code') ?? all[0]).id,
    all.filter((t) => !['done', 'failed'].includes(t.status)).slice(0, 6).map((t) => t.id))
  seedWorkflows(db, (all.find((t) => t.type === 'code') ?? all[0]).id)
  await pauseLikeRunner(db, config)
  return controller
}
