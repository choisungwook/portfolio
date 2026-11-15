// Seeds a temporary home with a week of invented data and serves the UI on 127.0.0.1. No runner loop starts and the
// queue is paused, so no agent session can run. Stop with Ctrl-C; the temporary home is removed.
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_PORT = 4599
const INFERENCE_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'] as const

// Directories created for this run, removed if startup fails before the stop handler exists.
const made: string[] = []

function refuse(message: string): never {
  console.error(`taskq demo: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  if (process.env.TASKQ_HOME !== undefined) refuse('TASKQ_HOME is already set; the demo seeds only a fresh temporary home')
  const port = Number(process.env.TASKQ_DEMO_PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) refuse(`TASKQ_DEMO_PORT is not a port: ${process.env.TASKQ_DEMO_PORT}`)

  const home = mkdtempSync(join(tmpdir(), 'taskq-demo-'))
  const configDir = mkdtempSync(join(tmpdir(), 'taskq-demo-claude-'))
  made.push(home, configDir)
  console.log(`taskq demo home: ${home}`)
  writeFileSync(join(home, 'taskq.config.json'), `${JSON.stringify({ provider: 'api_key', port }, null, 2)}\n`)
  process.env.TASKQ_HOME = home
  process.env.TASKQ_NO_NOTIFY = '1'
  process.env.CLAUDE_CONFIG_DIR = configDir
  for (const name of INFERENCE_ENV) delete process.env[name]

  const { loadConfig } = await import('../src/config.ts')
  const { openDb } = await import('../src/db/open.ts')
  const { isQueuePaused } = await import('../src/db/meta.ts')
  const { listTasks } = await import('../src/db/tasks.ts')
  const { startServer } = await import('../src/api/server.ts')
  const { seedDemo } = await import('./demo-seed.ts')

  const config = loadConfig()
  const db = openDb(config.home)
  const controller = await seedDemo(db, config, home, configDir, Math.floor(Date.now() / 1000))
  const token = randomBytes(32).toString('hex')
  const server = await startServer({ db, config }, token)

  const stop = () => {
    controller.abort()
    server.close()
    db.close()
    rmSync(home, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
  }

  if (!isQueuePaused(db)) {
    stop()
    refuse('assertion failed: the queue is not paused')
  }
  if (listTasks(db, 'ready').length > 0) {
    stop()
    refuse('assertion failed: the database holds a task in status ready')
  }

  console.log(`taskq demo: http://127.0.0.1:${port}/#token=${token}`)
  console.log('taskq demo: the queue is paused and no session will start; press Ctrl-C to stop and remove the temporary home')
  const shutdown = () => {
    stop()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(`taskq demo: ${error instanceof Error ? error.message : String(error)}`)
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  process.exit(1)
})
