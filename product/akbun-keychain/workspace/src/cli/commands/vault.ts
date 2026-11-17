import { agentRequest, agentStatus } from '../../agent/client.ts'
import { readAudit } from '../../core/audit.ts'
import { KeychainError } from '../../core/errors.ts'
import { homeDir, vaultPath } from '../../core/paths.ts'
import { readVaultFile } from '../../core/vault-file.ts'
import { changePassword, initVault, openVault, vaultExists, verify as verifyVault, type VerifyResult } from '../../core/vault.ts'
import {
  FAIL_DENIED, FAIL_INTEGRITY, FAIL_LOCKED, FAIL_USAGE, JSON_OPTION, PASSWORD_STDIN, type Command, flag, needsPassword, option, usageError,
} from '../command.ts'
import { splitFirstLine } from '../io.ts'
import { audited, kdfNFromEnv, line, printJson, readPassword } from './shared.ts'

export const init: Command = {
  name: 'init',
  summary: 'Create the vault and set the root password',
  needs: 'nothing',
  usage: 'akbun-keychain init [--password-stdin]',
  description:
    'Creates ~/.akbun-keychain (or $AKBUN_KEYCHAIN_HOME) and an empty vault. The root password is asked twice and ' +
    'must be at least 12 characters. It cannot be recovered if forgotten.',
  positionals: [],
  options: [PASSWORD_STDIN],
  examples: ['akbun-keychain init', 'AKBUN_KEYCHAIN_HOME=/tmp/kc akbun-keychain init'],
  exitCodes: [[0, 'Created.'], [2, 'Password too short or not matching.'], [8, 'A vault already exists.']],
  ifFails: [FAIL_USAGE, [8, 'A vault exists. Use it; move vault.json away to start over.']],
  async run(context) {
    let password: string
    if (flag(context.args, 'password-stdin')) {
      password = splitFirstLine(context.io.readStdin())[0]
    } else {
      if (!context.io.stdinIsTty) throw needsPassword()
      password = context.io.promptHidden('New root password: ')
      if (context.io.promptHidden('Repeat it: ') !== password) throw usageError('the passwords do not match', 'init')
    }
    await initVault(password, { kdfN: kdfNFromEnv() })
    line(context, `Created ${vaultPath()}.`)
    line(context, 'Next: akbun-keychain set <name>, then akbun-keychain unlock')
    return 0
  },
}

export const status: Command = {
  name: 'status',
  summary: 'Show whether the vault is locked, and until when',
  needs: 'nothing',
  usage: 'akbun-keychain status [--json]',
  description: 'Prints the vault path, the number of keys, and whether an agent is running. Run this first.',
  positionals: [],
  options: [JSON_OPTION],
  examples: ['akbun-keychain status', 'akbun-keychain status --json'],
  exitCodes: [[0, 'Printed, locked or not.']],
  ifFails: [[1, 'Unexpected error. Retry once, then ask the user.']],
  async run(context) {
    const agent = await agentStatus('cli')
    let entries: number | undefined
    let initialized = vaultExists()
    if (initialized) {
      try {
        entries = Object.keys(readVaultFile(vaultPath()).entries).length
      } catch {
        initialized = true
      }
    }
    const result = {
      initialized,
      locked: agent.locked,
      home: homeDir(),
      entries,
      expires_at: agent.expires_at ?? null,
      idle_expires_at: agent.idle_expires_at ?? null,
    }
    if (flag(context.args, 'json')) {
      printJson(context, result)
      return 0
    }
    line(context, `Vault: ${vaultPath()}${initialized ? '' : ' (not created: run akbun-keychain init)'}`)
    if (entries !== undefined) line(context, `Keys: ${entries}`)
    if (agent.locked) line(context, 'Locked. Ask the user to run: akbun-keychain unlock')
    else line(context, `Unlocked until ${agent.idle_expires_at} if idle (hard limit ${agent.expires_at}).`)
    return 0
  },
}

export const passwd: Command = {
  name: 'passwd',
  summary: 'Change the root password',
  needs: 'password',
  usage: 'akbun-keychain passwd [--password-stdin]',
  description:
    'Re-wraps the key under a new root password and stops the agent. Keys are not re-encrypted. With ' +
    '--password-stdin, line 1 is the old password and line 2 the new one.',
  positionals: [],
  options: [PASSWORD_STDIN],
  examples: ['akbun-keychain passwd', 'printf "%s\\n%s\\n" "$OLD" "$NEW" | akbun-keychain passwd --password-stdin'],
  exitCodes: [[0, 'Changed.'], [2, 'New password too short or not matching.'], [4, 'Wrong old password.']],
  ifFails: [FAIL_USAGE, FAIL_DENIED],
  async run(context) {
    let oldPassword: string
    let newPassword: string
    if (flag(context.args, 'password-stdin')) {
      const [first, rest] = splitFirstLine(context.io.readStdin())
      oldPassword = first
      newPassword = splitFirstLine(rest)[0]
    } else {
      if (!context.io.stdinIsTty) throw needsPassword()
      oldPassword = context.io.promptHidden('Current root password: ')
      newPassword = context.io.promptHidden('New root password: ')
      if (context.io.promptHidden('Repeat it: ') !== newPassword) throw usageError('the passwords do not match', 'passwd')
    }
    await audited('passwd', [], () => changePassword(oldPassword, newPassword))
    try {
      await agentRequest('lock', {}, { actor: 'cli' })
    } catch {
      // Not running.
    }
    line(context, 'Root password changed. The agent was stopped; unlock again with the new password.')
    return 0
  },
}

export const verify: Command = {
  name: 'verify',
  summary: 'Check every key and the file MAC',
  needs: 'session or password',
  usage: 'akbun-keychain verify [--password-stdin] [--json]',
  description:
    'Authenticates every key and the file as a whole, and lists what fails. Use it after an integrity error to see ' +
    'which key was edited by hand. vault.json.bak holds the file before the last write.',
  positionals: [],
  options: [PASSWORD_STDIN, JSON_OPTION],
  examples: ['akbun-keychain verify', 'akbun-keychain verify --json'],
  exitCodes: [[0, 'Everything authenticates.'], [3, 'Locked.'], [4, 'Wrong password.'], [5, 'Something fails.']],
  ifFails: [FAIL_LOCKED, FAIL_DENIED, FAIL_INTEGRITY],
  async run(context) {
    let result: VerifyResult | undefined
    if (!flag(context.args, 'password-stdin')) {
      try {
        result = await agentRequest<VerifyResult>('verify', {}, { actor: 'cli' })
      } catch (error) {
        if (!(error instanceof KeychainError && (error.code === 'LOCKED' || error.code === 'BAD_TOKEN')) || !context.io.stdinIsTty) throw error
      }
    }
    if (!result) {
      const dataKey = openVault(readPassword(context).password)
      result = verifyVault(dataKey)
      dataKey.fill(0)
    }
    const ok = result.mac_ok && result.entries_failed.length === 0
    if (flag(context.args, 'json')) printJson(context, result)
    else if (ok) line(context, 'All keys and the file MAC authenticate.')
    else {
      if (!result.mac_ok) line(context, 'The file MAC fails: an entry was added, removed, renamed or rolled back.')
      for (const name of result.entries_failed) line(context, `Fails: ${name} (its metadata was edited)`)
      line(context, `Restore ${vaultPath()}.bak if you did not make these changes.`)
    }
    return ok ? 0 : 5
  },
}

export const audit: Command = {
  name: 'audit',
  summary: 'Print the audit log, newest last',
  needs: 'nothing',
  usage: 'akbun-keychain audit [--limit <n>] [--json]',
  description: 'Prints what was used, created and changed, by whom (cli, mcp, gui). It never contains values or arguments.',
  positionals: [],
  options: [{ name: 'limit', type: 'string', placeholder: 'n', default: '50', description: 'Number of lines.' }, JSON_OPTION],
  examples: ['akbun-keychain audit', 'akbun-keychain audit --limit 200 --json'],
  exitCodes: [[0, 'Printed.'], [2, 'Invalid --limit.']],
  ifFails: [FAIL_USAGE],
  async run(context) {
    const limitText = option(context.args, 'limit') ?? '50'
    const limit = Number(limitText)
    if (!Number.isInteger(limit) || limit <= 0) throw usageError('--limit must be a positive integer', 'audit')
    const lines = readAudit(limit)
    if (flag(context.args, 'json')) {
      printJson(context, lines)
      return 0
    }
    for (const entry of lines) {
      const keys = entry.keys.length ? ` ${entry.keys.join(',')}` : ''
      const program = entry.program ? ` ${entry.program}${entry.env?.length ? ` env=${entry.env.join(',')}` : ''}` : ''
      const result = entry.ok ? 'ok' : `failed ${entry.code ?? ''}`.trim()
      line(context, `${entry.at} ${entry.actor} ${entry.op}${keys}${program} ${result}`)
    }
    return 0
  },
}
