import { agentRequest } from '../../agent/client.ts'
import type { RunResult } from '../../agent/protocol.ts'
import { FAIL_LOCKED, FAIL_NOT_FOUND, FAIL_USAGE, type Command, list, option, parseDuration, usageError } from '../command.ts'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

export const run: Command = {
  name: 'run',
  summary: 'Run a command with secrets in its environment, output masked',
  needs: 'session',
  usage: 'akbun-keychain run --env <VAR>=<name>... [--timeout <duration>] -- <command>...',
  description:
    'The agent starts the command in the current directory with your environment plus each VAR set to the value of ' +
    'key <name>. Values never reach your context: stdout and stderr come back with every occurrence replaced by ' +
    '[masked:<name>]. No shell is used, and the command has no terminal. Works with inject and reveal keys.',
  positionals: [{ name: 'command', description: 'The program and its arguments, after --.', rest: true }],
  options: [
    { name: 'env', type: 'string', placeholder: 'VAR=name', repeat: true, description: 'Environment variable and the key that fills it.' },
    { name: 'timeout', type: 'string', placeholder: 'duration', default: '10m', description: 'Kill the command after this long.' },
  ],
  examples: [
    'akbun-keychain run --env GH_TOKEN=github/token -- gh repo list',
    'akbun-keychain run --env A=aws/id --env B=aws/secret -- aws s3 ls',
  ],
  exitCodes: [
    [0, 'The command exited 0. Otherwise its own exit code is returned.'],
    [3, 'Locked.'],
    [4, 'A key is deny.'],
    [7, 'No such key.'],
    [124, 'Killed at the timeout.'],
    [125, 'The program could not be started.'],
  ],
  ifFails: [
    FAIL_LOCKED,
    [4, 'A deny key cannot be used by a session. Ask the user, or use another key.'],
    FAIL_NOT_FOUND,
    FAIL_USAGE,
    [124, 'Raise --timeout, or make the command finish sooner.'],
    [125, 'Check the program name and PATH. A shell builtin needs `sh -c`.'],
  ],
  async run(context) {
    const command = context.args.rest
    if (command.length === 0) throw usageError('give the command after --', 'run')
    const env: Record<string, string> = {}
    for (const pair of list(context.args, 'env') ?? []) {
      const index = pair.indexOf('=')
      if (index <= 0 || index === pair.length - 1) throw usageError('--env takes VAR=name, like GH_TOKEN=github/token', 'run')
      env[pair.slice(0, index)] = pair.slice(index + 1)
    }
    const timeoutText = option(context.args, 'timeout')
    const timeout_ms = timeoutText ? parseDuration(timeoutText, 'run') : DEFAULT_TIMEOUT_MS
    const base_env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    const abort = new AbortController()
    const onSignal = () => abort.abort()
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
    try {
      const result = await agentRequest<RunResult>(
        'run',
        { command, env, base_env, cwd: process.cwd(), timeout_ms },
        {
          actor: 'cli',
          signal: abort.signal,
          onStream: (line) => (line.stream === 'stdout' ? context.io.out(line.data) : context.io.err(line.data)),
        },
      )
      return result.exit_code ?? 1
    } finally {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
    }
  },
}
