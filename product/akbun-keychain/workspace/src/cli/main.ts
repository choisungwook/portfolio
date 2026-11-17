import { KeychainError } from '../core/errors.ts'
import { type Command, commandHelp, commandJson, exitCodeOf, parseArgs, usageError, wrap } from './command.ts'
import { COMMANDS, findCommand } from './commands/index.ts'
import { type Io, processIo } from './io.ts'

function overview(): string {
  const visible = COMMANDS.filter((command) => !command.hidden)
  const width = Math.max(...visible.map((command) => command.name.length))
  const lines = [
    'akbun-keychain: a local secret store for AI agents. Values stay encrypted and',
    'reach commands through `run` without entering your context.',
    '',
    'Usage: akbun-keychain <command> [arguments]',
    '',
    'Commands:',
    ...visible.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    '',
    'Typical agent workflow:',
    ...wrap('1. akbun-keychain status: if locked, ask the user to run `akbun-keychain unlock`. Do not retry.', 2),
    ...wrap('2. akbun-keychain list: find the key name.', 2),
    ...wrap('3. akbun-keychain run --env VAR=<name> -- <command>: use it without seeing it.', 2),
    '',
    'Run `akbun-keychain <command> --help` for details.',
    'Run `akbun-keychain help --json` for the command table as JSON.',
  ]
  return `${lines.join('\n')}\n`
}

function printHelp(io: Io, argv: string[]): number {
  const json = argv.includes('--json')
  const names = argv.filter((arg) => !arg.startsWith('--'))
  if (names.length > 1) throw usageError('help takes one command name')
  if (names.length === 1) {
    const command = findCommand(names[0])
    if (!command) throw usageError(`unknown command ${JSON.stringify(names[0])}`)
    io.out(json ? `${JSON.stringify(commandJson(command), null, 2)}\n` : commandHelp(command))
    return 0
  }
  if (json) {
    const table = COMMANDS.filter((command) => !command.hidden).map(commandJson)
    io.out(`${JSON.stringify({ commands: table }, null, 2)}\n`)
  } else {
    io.out(overview())
  }
  return 0
}

export async function main(argv: string[], io: Io = processIo()): Promise<number> {
  try {
    const [name, ...rest] = argv
    if (name === undefined || name === '--help' || name === '-h') return printHelp(io, [])
    if (name === '--version') return await (findCommand('version') as Command).run({ io, args: { positionals: [], rest: [], options: {} } })
    if (name === 'help' && rest.includes('--help')) {
      io.out(commandHelp(findCommand('help') as Command))
      return 0
    }
    if (name === 'help') return printHelp(io, rest)
    const command = findCommand(name)
    if (!command) throw usageError(`unknown command ${JSON.stringify(name)}`)
    const dashDash = rest.indexOf('--')
    const beforeDashDash = dashDash === -1 ? rest : rest.slice(0, dashDash)
    if (beforeDashDash.includes('--help')) {
      io.out(commandHelp(command))
      return 0
    }
    return await command.run({ io, args: parseArgs(command, rest) })
  } catch (error) {
    if (error instanceof KeychainError) {
      io.err(`${error.code}: ${error.message}\n`)
    } else {
      io.err('UNEXPECTED: an internal error occurred: retry, and report it if it repeats\n')
    }
    return exitCodeOf(error)
  }
}

process.exitCode = await main(process.argv.slice(2))
// Commands that do not serve anything end here, even if a socket is still closing.
if (process.exitCode !== 0 || !['agent', 'mcp', 'gui'].includes(process.argv[2] ?? '')) process.exit(process.exitCode)
