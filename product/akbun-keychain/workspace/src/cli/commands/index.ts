import type { Command } from '../command.ts'
import { edit, get, listCommand, rm, set } from './keys.ts'
import { help, version } from './meta.ts'
import { run } from './run.ts'
import { gui, mcp } from './serve.ts'
import { agent, lock, unlock } from './session.ts'
import { audit, init, passwd, status, verify } from './vault.ts'

// The one table the parser and the help both read, so help cannot drift from behavior.
export const COMMANDS: Command[] = [
  status, listCommand, run, get, set, unlock, lock, init, edit, rm, passwd, verify, audit, gui, mcp, version, help, agent,
]

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((command) => command.name === name)
}
