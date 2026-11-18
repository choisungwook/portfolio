import { execFileSync } from 'node:child_process'
import { loadConfig } from '../config.ts'
import { claudeExecutable } from '../resources.ts'
import pkg from '../../package.json' with { type: 'json' }
import { openDb } from '../db/open.ts'
import * as tasks from './commands.ts'
import * as info from './info.ts'
import { runCommand } from './run.ts'
import { skills } from './skills.ts'
import * as operator from './operator.ts'
import { handoff, handoffs } from './handoffs.ts'
import { bots } from './bots.ts'
import { api } from './api.ts'
import { workflows } from './workflows.ts'
import type { Command } from './types.ts'

const COMMANDS: Record<string, Command> = {
  add: tasks.add,
  list: tasks.list,
  show: tasks.show,
  approve: tasks.approve,
  deny: tasks.deny,
  resume: tasks.resume,
  done: tasks.done,
  alerts: info.alerts,
  log: info.log,
  search: info.search,
  skills,
  pause: operator.pause,
  unpause: operator.unpause,
  cancel: operator.cancel,
  retry: operator.retry,
  handoff,
  handoffs,
  bots,
  workflows,
  api,
}

const USAGE = `usage: taskq <command> [options]
  add --type T --intent TEXT [--title] [--cautions] [--access-skill] [--target-profile] [--lock-key]
      [--repo] [--output] [--priority N] [--depends-on ID]... [--manual-handoffs] [--draft]   (ready unless --draft)
  list [--status S]    show ID     resume ID    done ID
  approve ID [--request REQUEST_ID --yes]    deny ID [--request REQUEST_ID --yes]
  alerts               log [--date YYYY-MM-DD]    search QUERY    run    version
  skills list | add PATH | remove NAME | discover
  handoffs [--task TASK]    handoff accept ID    handoff mode TASK [auto|manual]    mcp [--bot NAME]
  pause [--reason TEXT]    unpause    cancel ID    retry ID [--draft] [--resume]
  bots list | say [--to NAME] TEXT | inbox | log | turns | threads | wiki [SLUG] | search | export | assign | pause | resume | enable | disable | reset
  workflows list | show | create FILE | update | delete | run ID --bot NAME | runs | run-show | cancel | approve
  api [OPERATION key=value... | --json JSON]   every API route by name; taskq api lists them (the MCP server offers the same as taskq_<name>)`

export async function main(argv: string[]): Promise<void> {
  const [name, ...args] = argv
  if (!name || name === 'help' || name === '--help') {
    console.log(USAGE)
    return
  }
  if (name === 'version') {
    printVersion()
    return
  }
  const config = loadConfig()
  const db = openDb(config.home)
  if (name === 'run') {
    await runCommand(config, db)
    return
  }
  if (name === 'mcp') {
    try {
      const { serveBotMcp, serveMcp } = await import('../mcp/server.ts')
      // `taskq mcp --bot NAME`: that bot's own tools, for Codex and Kiro turns. Plain `taskq mcp`: every operation.
      const bot = args[0] === '--bot' ? args[1] : undefined
      if (bot) await serveBotMcp(db, config, bot, pkg.version)
      else await serveMcp(db, config, pkg.version)
    } finally {
      db.close()
    }
    return
  }
  const command = COMMANDS[name]
  if (!command) {
    console.error(`unknown command: ${name}\n${USAGE}`)
    process.exitCode = 2
    db.close()
    return
  }
  try {
    await command({ config, db }, args)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    db.close()
  }
}

// The binary also runs its embedded Claude Code, so a broken extraction shows up here and not at the first session.
function printVersion(): void {
  console.log(`taskq ${pkg.version}`)
  const claude = claudeExecutable()
  if (claude) console.log(`claude ${execFileSync(claude, ['--version'], { encoding: 'utf8' }).trim()}`)
}

await main(process.argv.slice(2))
