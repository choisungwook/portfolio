import { randomBytes } from 'node:crypto'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { createRunner } from '../runner/runner.ts'
import { agentFor } from '../agents/index.ts'
import { startServer } from '../api/server.ts'
import { createRetrospector } from '../memory/retrospect.ts'
import { createTeamHub, type TeamHub } from '../team/hub.ts'

// Runs the loop and the API in this process until SIGINT or SIGTERM. The API token lives in memory only: a new start
// issues a new token, and the UI gets it from the URL fragment printed below.
export async function runCommand(config: Config, db: Db): Promise<void> {
  const agent = agentFor(config)
  const runner = createRunner({
    db, config, worker: agent.createWorker(config), preflight: () => agent.preflight(config),
    retrospect: config.retrospect ? createRetrospector({ db, config, ask: (request) => agent.ask(config, request) }) : undefined,
  })
  const token = randomBytes(32).toString('hex')
  const server = await startServer({ db, config, control: runner }, token)
  await runner.start()
  const hub = teamHub(config, db, agent)
  await hub?.start()
  console.log(`taskq running at http://127.0.0.1:${config.port}/#token=${token}`)
  const shutdown = async () => {
    await hub?.stop()
    await runner.stop()
    server.close()
    db.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

function teamHub(config: Config, db: Db, agent: ReturnType<typeof agentFor>): TeamHub | undefined {
  if (!config.bots.enabled) return undefined
  if (!agent.team) {
    console.warn(`taskq: the ${agent.name} backend has no bots support; bots.enabled is ignored`)
    return undefined
  }
  return createTeamHub({ db, config, backend: agent.team })
}
