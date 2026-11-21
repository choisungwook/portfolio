import { randomBytes } from 'node:crypto'
import { closeBrowsers } from '../browser/chrome.ts'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { createRunner } from '../runner/runner.ts'
import { agentFor } from '../agents/index.ts'
import { startServer } from '../api/server.ts'
import { createRetrospector } from '../memory/retrospect.ts'
import { createTeamHub, type TeamHub } from '../team/hub.ts'
import { createOpenAITeamBackend } from '../agents/openai/team.ts'
import { createKiroTeamBackend } from '../agents/kiro/team.ts'
import { createJobRunner } from '../jobs/runner.ts'
import { JOB_HANDLERS } from '../jobs/handlers.ts'

// Runs the loop and the API in this process until SIGINT or SIGTERM. The API token lives in memory only: a new start
// issues a new token, and the UI gets it from the URL fragment printed below.
export async function runCommand(config: Config, db: Db): Promise<void> {
  const agent = agentFor(config)
  const runner = createRunner({
    db, config, worker: agent.createWorker(config), preflight: () => agent.preflight(config),
    retrospect: config.retrospect ? createRetrospector({ db, config, ask: (request) => agent.ask(config, request) }) : undefined,
  })
  const token = randomBytes(32).toString('hex')
  const hub = teamHub(config, db, agent)
  const server = await startServer({ db, config, control: runner, bots: hub }, token)
  await runner.start()
  await hub?.start()
  const jobs = createJobRunner(db, config, JOB_HANDLERS)
  jobs.start()
  console.log(`taskq running at http://127.0.0.1:${config.port}/#token=${token}`)
  const shutdown = async () => {
    await hub?.stop()
    await closeBrowsers(config)
    await jobs.stop()
    await runner.stop()
    server.close()
    db.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

function teamHub(config: Config, db: Db, agent: ReturnType<typeof agentFor>): TeamHub | undefined {
  if (!agent.team) {
    console.warn(`taskq: the ${agent.name} backend has no bots support; bots do not run`)
    return undefined
  }
  // OpenAI bots run on their own backend next to the Claude one; it needs OPENAI_API_KEY only when such a bot works.
  return createTeamHub({ db, config, backend: agent.team, backends: { openai: createOpenAITeamBackend(), kiro: createKiroTeamBackend() } })
}
