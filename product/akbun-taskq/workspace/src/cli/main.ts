import { loadConfig } from '../config.ts'
import { openDb } from '../db/open.ts'
import * as tasks from './commands.ts'
import * as info from './info.ts'
import { runCommand } from './run.ts'
import { skills } from './skills.ts'
import * as operator from './operator.ts'
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
}

const USAGE = `usage: taskq <command> [options]
  add --type T --intent TEXT [--title] [--cautions] [--access-skill] [--target-profile] [--lock-key]
      [--repo] [--output] [--priority N] [--depends-on ID]... [--draft]   (ready unless --draft)
  list [--status S]    show ID     resume ID    done ID
  approve ID [--request REQUEST_ID --yes]    deny ID [--request REQUEST_ID --yes]
  alerts               log [--date YYYY-MM-DD]    search QUERY    run
  skills list | add PATH | remove NAME | discover
  pause [--reason TEXT]    unpause    cancel ID    retry ID [--draft] [--resume]`

export async function main(argv: string[]): Promise<void> {
  const [name, ...args] = argv
  if (!name || name === 'help' || name === '--help') {
    console.log(USAGE)
    return
  }
  const config = loadConfig()
  const db = openDb(config.home)
  if (name === 'run') {
    await runCommand(config, db)
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

await main(process.argv.slice(2))
