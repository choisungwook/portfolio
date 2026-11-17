import { agentRequest, agentStatus, readAgentInfo } from '../../agent/client.ts'
import { ABSOLUTE_LIMIT_MS, DEFAULT_IDLE_MS } from '../../agent/protocol.ts'
import { startAgent } from '../../agent/server.ts'
import { startDetachedAgent, type Handover } from '../../agent/spawn.ts'
import { KeychainError } from '../../core/errors.ts'
import { openVault } from '../../core/vault.ts'
import { FAIL_DENIED, FAIL_USAGE, PASSWORD_STDIN, option, parseDuration, usageError, type Command } from '../command.ts'
import { readAllStdin } from '../io.ts'
import { line, readPassword } from './shared.ts'

export const unlock: Command = {
  name: 'unlock',
  summary: 'Start the agent so AI agents can use the vault',
  needs: 'password',
  usage: 'akbun-keychain unlock [--ttl <duration>] [--password-stdin]',
  description:
    'Asks for the root password and starts a background agent that holds the key in memory. Until it stops, ' +
    '`run`, `list` and the MCP server work without the password. It stops after the idle timeout, after 8 hours, ' +
    'or on `lock`.',
  positionals: [],
  options: [
    { name: 'ttl', type: 'string', placeholder: 'duration', default: '15m', description: 'Idle timeout, up to 8h. Units ms, s, m, h.' },
    PASSWORD_STDIN,
  ],
  examples: ['akbun-keychain unlock', 'akbun-keychain unlock --ttl 1h'],
  exitCodes: [[0, 'Unlocked, or already unlocked.'], [2, 'Usage error.'], [4, 'Wrong password.']],
  ifFails: [FAIL_USAGE, FAIL_DENIED],
  async run(context) {
    const ttlText = option(context.args, 'ttl')
    const idleMs = ttlText ? parseDuration(ttlText, 'unlock') : DEFAULT_IDLE_MS
    if (idleMs > ABSOLUTE_LIMIT_MS) throw usageError('--ttl is at most 8h', 'unlock')
    const current = await agentStatus('cli')
    if (!current.locked) {
      line(context, `Already unlocked until ${current.idle_expires_at} (hard limit ${current.expires_at}).`)
      return 0
    }
    const { password } = readPassword(context)
    const dataKey = openVault(password)
    try {
      await startDetachedAgent(dataKey, idleMs, ABSOLUTE_LIMIT_MS, 'cli')
    } finally {
      dataKey.fill(0)
    }
    const status = await agentStatus('cli')
    line(context, `Unlocked until ${status.idle_expires_at} if idle (hard limit ${status.expires_at}).`)
    line(context, 'Stop it with: akbun-keychain lock')
    return 0
  },
}

export const lock: Command = {
  name: 'lock',
  summary: 'Stop the agent and forget the key',
  needs: 'nothing',
  usage: 'akbun-keychain lock',
  description: 'Stops the background agent. Running `run` commands are killed. Nothing can use the vault until the next unlock.',
  positionals: [],
  options: [],
  examples: ['akbun-keychain lock', 'akbun-keychain lock && akbun-keychain status'],
  exitCodes: [[0, 'Locked, or already locked.']],
  ifFails: [[1, 'Unexpected error. Run `akbun-keychain status` to see the state.']],
  async run(context) {
    if (!readAgentInfo()) {
      line(context, 'Already locked.')
      return 0
    }
    try {
      await agentRequest('lock', {}, { actor: 'cli' })
    } catch (error) {
      if (!(error instanceof KeychainError && (error.code === 'LOCKED' || error.code === 'BAD_TOKEN'))) throw error
    }
    line(context, 'Locked.')
    return 0
  },
}

export const agent: Command = {
  name: 'agent',
  summary: 'Internal: the background agent started by unlock',
  needs: 'nothing',
  hidden: true,
  usage: 'akbun-keychain agent',
  description: 'Started by unlock and by the page. Reads the key from stdin. Do not run it by hand.',
  positionals: [],
  options: [],
  examples: ['akbun-keychain unlock', 'akbun-keychain lock'],
  exitCodes: [[0, 'Stopped.']],
  ifFails: [[1, 'Run `akbun-keychain unlock` instead.']],
  async run() {
    const handover = JSON.parse(readAllStdin().split('\n')[0] || '{}') as Partial<Handover>
    if (typeof handover.data_key !== 'string' || typeof handover.idle_ms !== 'number' || typeof handover.absolute_ms !== 'number') {
      throw usageError('agent is started by unlock, not by hand', 'unlock')
    }
    process.stdout.on('error', () => {})
    process.stderr.on('error', () => {})
    const running = await startAgent({
      dataKey: Buffer.from(handover.data_key, 'base64'),
      idleMs: handover.idle_ms,
      absoluteMs: handover.absolute_ms,
      actor: handover.actor === 'gui' ? 'gui' : 'cli',
      onExit: () => process.exit(0),
    })
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => void running.close())
    process.stdout.write('ready\n')
    return new Promise<number>(() => {})
  },
}
