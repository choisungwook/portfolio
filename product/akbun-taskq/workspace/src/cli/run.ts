import { randomBytes } from 'node:crypto'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { createRunner } from '../runner/runner.ts'
import { createWorker } from '../worker/index.ts'
import { startServer } from '../api/server.ts'
import { preflight } from '../worker/auth.ts'
import { createRetrospector } from '../memory/retrospect.ts'

// Runs the loop and the API in this process until SIGINT or SIGTERM. The API token lives in memory only: a new start
// issues a new token, and the UI gets it from the URL fragment printed below.
export async function runCommand(config: Config, db: Db): Promise<void> {
  const runner = createRunner({
    db, config, worker: createWorker(config), preflight: () => preflight(config),
    retrospect: config.retrospect ? createRetrospector({ db, config }) : undefined,
  })
  const token = randomBytes(32).toString('hex')
  const server = await startServer({ db, config }, token)
  await runner.start()
  console.log(`taskq running at http://127.0.0.1:${config.port}/#token=${token}`)
  const shutdown = async () => {
    await runner.stop()
    server.close()
    db.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}
