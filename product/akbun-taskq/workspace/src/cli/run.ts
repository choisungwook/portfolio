import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
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
import { relaunch, takeRestartToken } from '../relaunch.ts'
import { installBuiltinSkill } from '../team/builtin-skill.ts'

// Runs the loop and the API in this process until SIGINT or SIGTERM. The API token lives in memory only: a new start
// issues a new token, and the UI gets it from the URL fragment printed below. Settings > Update's restart keeps it.
// The desktop app's start page shows these as a bar: `taskq starting <percent> <step>` (desktop/src-tauri, launch crate).
export function starting(percent: number, step: string): void {
  console.log(`taskq starting ${percent} ${step}`)
}

export async function runCommand(config: Config, db: Db): Promise<void> {
  starting(35, 'writing the taskq skill')
  // The taskq skill and this version's manual are written fresh on every start; hub.start() then reloads every bot's
  // skill copy (one bot at a time, a failing one only logged), so each bot carries the running version's.
  installBuiltinSkill(config)
  starting(45, 'preparing the runner')
  const agent = agentFor(config)
  const runner = createRunner({
    db, config, worker: agent.createWorker(config), preflight: () => agent.preflight(config),
    retrospect: config.retrospect ? createRetrospector({ db, config, ask: (request) => agent.ask(config, request) }) : undefined,
  })
  const dataDir = join(config.home, 'data')
  const token = takeRestartToken(dataDir) ?? randomBytes(32).toString('hex')
  const hub = teamHub(config, db, agent)
  starting(60, 'starting the server')
  const server = await startServer({ db, config, control: runner, bots: hub, restart: () => void restart() }, token)
  starting(70, 'starting the queue')
  await runner.start()
  starting(85, 'loading the bots')
  await hub?.start()
  const jobs = createJobRunner(db, config, JOB_HANDLERS)
  jobs.start()
  starting(100, 'ready')
  console.log(`taskq running at http://127.0.0.1:${config.port}/#token=${token}`)
  const stop = async () => {
    await hub?.stop()
    await closeBrowsers(config)
    await jobs.stop()
    await runner.stop()
    server.close()
    db.close()
  }
  const shutdown = async () => {
    await stop()
    process.exit(0)
  }
  // A failure halfway leaves bots and the database half closed, so the process ends instead of limping on.
  async function restart() {
    try {
      await stop()
      relaunch(dataDir, token)
    } catch (error) {
      console.error(`taskq: restart failed: ${String(error)}`)
      process.exit(1)
    }
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
