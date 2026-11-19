import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveConfig, type Config } from '../src/config.ts'
import { openDb, type Db } from '../src/db/open.ts'
import { insertTask, getTask, type NewTask } from '../src/db/tasks.ts'
import type { Task, Worker, WorkerContext, WorkerResult, Outcome } from '../src/types.ts'
import { createRunner, type Runner, type RunnerOptions } from '../src/runner/runner.ts'

export interface TestEnv {
  home: string
  db: Db
  config: Config
  cleanup(): void
}

// Fresh temp TASKQ_HOME with short poll intervals so the suite finishes in seconds.
export function setup(overrides: Partial<Config> = {}): TestEnv {
  process.env.TASKQ_NO_NOTIFY = '1'
  // The real path: on macOS the temp folder is a symlink (/var -> /private/var) and git reports the resolved one.
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'taskq-test-')))
  const db = openDb(home)
  const config = resolveConfig(home, { pollSec: 0.02, heartbeatSec: 0.05, ...overrides })
  return {
    home,
    db,
    config,
    cleanup() {
      db.close()
      rmSync(home, { recursive: true, force: true })
    },
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const end = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > end) throw new Error('waitFor timed out')
    await sleep(5)
  }
}

export function addTask(db: Db, overrides: Partial<NewTask> = {}): Task {
  return insertTask(db, { type: 'research', status: 'ready', data: { intent: 'test task' }, ...overrides })
}

export function statusOf(db: Db, id: string): string {
  return getTask(db, id)!.status
}

export function result(outcome: Outcome, summary: string = outcome, extra: Partial<WorkerResult> = {}): WorkerResult {
  return { outcome, summary, stats: {}, alerts: [], followups: [], ...extra }
}

export function fakeWorker(handler: (ctx: WorkerContext) => Promise<WorkerResult> | WorkerResult): Worker {
  return async (ctx) => handler(ctx)
}

// The API token the tests pass to createApp and send in x-taskq-token.
export const TOKEN = 'test-token-0123456789abcdef'

const live: Runner[] = []

// A runner that a failing test did not stop keeps polling a closed database. Runners made here are stopped by stopRunners.
export function startRunner(options: RunnerOptions): Runner {
  const runner = createRunner(options)
  live.push(runner)
  return runner
}

export async function stopRunners(): Promise<void> {
  await Promise.all(live.splice(0).map((runner) => runner.stop()))
}

// The orchestrator taskq plus one bot per preset, named after the preset. Bot tests use this roster.
export async function seedTestBots(db: Db): Promise<void> {
  const { seedAgents } = await import('../src/db/team.ts')
  const { BOT_DEFAULTS, PRESETS, ROSTER } = await import('../src/team/roster.ts')
  seedAgents(db, [...ROSTER, ...Object.entries(PRESETS).map(([name, preset]) => ({ ...BOT_DEFAULTS, ...preset, name }))])
}
