import { VERSION } from '../../version.ts'
import { JSON_OPTION, type Command } from '../command.ts'
import { line } from './shared.ts'

export const version: Command = {
  name: 'version',
  summary: 'Print the version',
  needs: 'nothing',
  usage: 'akbun-keychain version',
  description: 'Prints the version of this executable.',
  positionals: [],
  options: [],
  examples: ['akbun-keychain version', 'akbun-keychain --version'],
  exitCodes: [[0, 'Printed.']],
  ifFails: [[1, 'The executable is broken. Reinstall it.']],
  async run(context) {
    line(context, `akbun-keychain ${VERSION}`)
    return 0
  },
}

// help needs the whole table, so main.ts answers it before the table is consulted; this entry is for --help and --json.
export const help: Command = {
  name: 'help',
  summary: 'Print help for every command, or the command table as JSON',
  needs: 'nothing',
  usage: 'akbun-keychain help [<command>] [--json]',
  description: 'Without arguments, lists every command. With a command name, prints that command\'s help. --json prints the table that the parser uses.',
  positionals: [{ name: 'command', description: 'A command name.', rest: true }],
  options: [JSON_OPTION],
  examples: ['akbun-keychain help run', 'akbun-keychain help --json'],
  exitCodes: [[0, 'Printed.'], [2, 'Unknown command.']],
  ifFails: [[2, 'Run `akbun-keychain help` for the command names.']],
  async run() {
    return 0
  },
}
