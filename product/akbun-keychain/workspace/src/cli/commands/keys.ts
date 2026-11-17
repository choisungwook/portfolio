import { agentRequest } from '../../agent/client.ts'
import { KeychainError } from '../../core/errors.ts'
import { vaultPath } from '../../core/paths.ts'
import type { SessionEntry } from '../../core/policy.ts'
import { checkAiAccess, readVaultFile, type AiAccess } from '../../core/vault-file.ts'
import { create, openVault, remove, rename, reveal, update, type EntryInfo } from '../../core/vault.ts'
import {
  FAIL_DENIED, FAIL_INTEGRITY, FAIL_LOCKED, FAIL_LOCK_TIMEOUT, FAIL_NOT_FOUND, FAIL_USAGE, JSON_OPTION, PASSWORD_STDIN,
  type Command, type Context, flag, list as listOption, needsPassword, option, usageError,
} from '../command.ts'
import { stripOneNewline } from '../io.ts'
import { audited, line, printJson, readPassword } from './shared.ts'

const NAME_ARG = { name: 'name', description: 'Key name, like github/personal-token.' }
const DESCRIPTION = { name: 'description', type: 'string' as const, placeholder: 'text', description: 'Plaintext note, at most 500 characters. Never a secret.' }
const TAG = { name: 'tag', type: 'string' as const, placeholder: 'tag', repeat: true, description: 'A tag. Repeat for more. Replaces all tags.' }
const AI_ACCESS = {
  name: 'ai-access',
  type: 'string' as const,
  placeholder: 'level',
  description: 'inject (use through run only), reveal (also readable by agents) or deny (human only). Needs the password.',
}

function aiAccess(context: Context): AiAccess | undefined {
  const value = option(context.args, 'ai-access')
  if (value !== undefined) checkAiAccess(value)
  return value as AiAccess | undefined
}

function isCode(error: unknown, ...codes: string[]): boolean {
  return error instanceof KeychainError && codes.includes(error.code)
}

type Row = Partial<EntryInfo> & Pick<EntryInfo, 'name' | 'ai_access'>

function printRows(context: Context, rows: Row[]): void {
  if (rows.length === 0) {
    line(context, 'No keys. Add one with: akbun-keychain set <name>')
    return
  }
  const width = Math.min(40, Math.max(...rows.map((row) => row.name.length)))
  for (const row of rows) {
    const mark = row.intact === false ? ' [fails authentication]' : ''
    const tags = row.tags?.length ? ` [${row.tags.join(', ')}]` : ''
    const description = row.description ? ` ${row.description}` : ''
    line(context, `${row.name.padEnd(width)}  ${row.ai_access.padEnd(6)}${tags}${description}${mark}`)
  }
}

export const listCommand: Command = {
  name: 'list',
  summary: 'List key names, descriptions, tags and access levels',
  needs: 'nothing',
  usage: 'akbun-keychain list [--tag <tag>] [--json]',
  description:
    'Lists keys without their values. When unlocked, the list comes from the agent and is authenticated; a deny key ' +
    'shows only its name and level. When locked, it is read from vault.json and marked unverified.',
  positionals: [],
  options: [{ name: 'tag', type: 'string', placeholder: 'tag', description: 'Only keys with this tag.' }, JSON_OPTION],
  examples: ['akbun-keychain list', 'akbun-keychain list --tag github --json'],
  exitCodes: [[0, 'Listed.'], [1, 'No vault yet.'], [5, 'vault.json is malformed.']],
  ifFails: [[1, 'No vault. Ask the user to run `akbun-keychain init`.'], FAIL_INTEGRITY],
  async run(context) {
    const tag = option(context.args, 'tag')
    let verified = true
    let rows: Row[]
    try {
      rows = (await agentRequest<{ entries: SessionEntry[] }>('list', tag ? { tag } : {}, { actor: 'cli' })).entries
    } catch (error) {
      if (!isCode(error, 'LOCKED', 'BAD_TOKEN')) throw error
      verified = false
      const vault = readVaultFile(vaultPath())
      rows = Object.entries(vault.entries)
        .filter(([, entry]) => !tag || entry.tags.includes(tag))
        .map(([name, entry]) => ({ name, ai_access: entry.ai_access, description: entry.description, tags: entry.tags, updated_at: entry.updated_at }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    if (flag(context.args, 'json')) {
      printJson(context, { verified, entries: rows })
      return 0
    }
    if (!verified) line(context, 'Locked: read from vault.json, not verified.')
    printRows(context, rows)
    return 0
  },
}

export const set: Command = {
  name: 'set',
  summary: 'Add a key, or replace the value of an existing one',
  needs: 'session or password',
  usage: 'akbun-keychain set <name> [--description <text>] [--tag <tag>]... [--ai-access <level>] [--password-stdin]',
  description:
    'Stores a secret. The value comes from a hidden prompt, or from stdin when stdin is not a terminal; one trailing ' +
    'newline is removed. A new name needs only an unlocked session and is always created as inject. Replacing an ' +
    'existing key or choosing --ai-access needs the root password. With --password-stdin, line 1 is the password ' +
    'and the rest of stdin is the value.',
  positionals: [NAME_ARG],
  options: [DESCRIPTION, TAG, AI_ACCESS, PASSWORD_STDIN],
  examples: [
    'printf %s "$TOKEN" | akbun-keychain set github/token --tag github',
    'akbun-keychain set openai/key --description "personal key"',
  ],
  exitCodes: [[0, 'Stored.'], [2, 'Invalid name, tag or value size.'], [4, 'Needs the password, or wrong password.']],
  ifFails: [
    FAIL_USAGE,
    [4, 'The name exists, or --ai-access was given, or the vault is locked: that needs the root password. Choose a new name, or ask the user.'],
    FAIL_LOCK_TIMEOUT,
  ],
  async run(context) {
    const [name] = context.args.positionals
    const access = aiAccess(context)
    const description = option(context.args, 'description')
    const tags = listOption(context.args, 'tag')
    if (flag(context.args, 'password-stdin')) {
      const { password, rest = '' } = readPassword(context)
      return withPassword(password, stripOneNewline(rest))
    }
    const value = context.io.stdinIsTty ? context.io.promptHidden('Value: ') : stripOneNewline(context.io.readStdin())
    if (access === undefined || access === 'inject') {
      try {
        await agentRequest('create', { name, value, description, tags }, { actor: 'cli' })
        line(context, `Created ${name} (inject).`)
        return 0
      } catch (error) {
        if (!isCode(error, 'LOCKED', 'BAD_TOKEN', 'EXISTS')) throw error
      }
    }
    if (!context.io.stdinIsTty) throw needsPassword()
    return withPassword(context.io.promptHidden('Root password: '), value)

    async function withPassword(password: string, secret: string): Promise<number> {
      const dataKey = openVault(password)
      const exists = Object.hasOwn(readVaultFile(vaultPath()).entries, name)
      if (exists) {
        await audited('update', [name], () => update(dataKey, name, { value: secret, description, tags, ai_access: access }))
        line(context, `Updated ${name}.`)
      } else {
        const created = await audited('create', [name], () => create(dataKey, { name, value: secret, description, tags, ai_access: access }))
        line(context, `Created ${name} (${created.ai_access}).`)
      }
      dataKey.fill(0)
      return 0
    }
  },
}

export const get: Command = {
  name: 'get',
  summary: 'Print a value to stdout',
  needs: 'session or password',
  usage: 'akbun-keychain get <name> [--password-stdin]',
  description:
    'Prints the value. An unlocked session can read only reveal keys. An inject or deny key needs the root password; ' +
    'to use an inject key in a command, use `run` instead, which never shows the value.',
  positionals: [NAME_ARG],
  options: [PASSWORD_STDIN],
  examples: ['akbun-keychain get npm/registry-url', 'akbun-keychain run --env GH_TOKEN=github/token -- gh repo list'],
  exitCodes: [[0, 'Printed.'], [3, 'Locked.'], [4, 'Denied.'], [5, 'Integrity failure.'], [7, 'No such key.']],
  ifFails: [FAIL_LOCKED, [4, 'This key is not reveal. Use `run`, or ask the user.'], FAIL_INTEGRITY, FAIL_NOT_FOUND],
  async run(context) {
    const [name] = context.args.positionals
    if (!flag(context.args, 'password-stdin')) {
      try {
        const { value } = await agentRequest<{ value: string }>('get', { name }, { actor: 'cli' })
        context.io.out(`${value}\n`)
        return 0
      } catch (error) {
        if (!isCode(error, 'LOCKED', 'BAD_TOKEN', 'DENIED') || !context.io.stdinIsTty) throw error
      }
    }
    const { password } = readPassword(context)
    const dataKey = openVault(password)
    const value = await audited('reveal', [name], () => reveal(dataKey, name))
    dataKey.fill(0)
    context.io.out(`${value}\n`)
    return 0
  },
}

export const edit: Command = {
  name: 'edit',
  summary: 'Change a key\'s description, tags, access level or name',
  needs: 'password',
  usage: 'akbun-keychain edit <name> [--description <text>] [--tag <tag>]... [--ai-access <level>] [--rename <new>] [--password-stdin]',
  description: 'Changes metadata. The value stays. To change the value, use `set` with the password.',
  positionals: [NAME_ARG],
  options: [DESCRIPTION, TAG, AI_ACCESS, { name: 'rename', type: 'string', placeholder: 'new', description: 'New key name.' }, PASSWORD_STDIN],
  examples: ['akbun-keychain edit aws/key --ai-access deny', 'akbun-keychain edit github/token --rename github/personal'],
  exitCodes: [[0, 'Changed.'], [2, 'Nothing to change, or invalid.'], [4, 'Wrong password.'], [7, 'No such key.'], [8, 'New name exists.']],
  ifFails: [FAIL_USAGE, FAIL_DENIED, FAIL_NOT_FOUND, [8, 'Choose another --rename.']],
  async run(context) {
    const [name] = context.args.positionals
    const access = aiAccess(context)
    const description = option(context.args, 'description')
    const tags = listOption(context.args, 'tag')
    const newName = option(context.args, 'rename')
    if (access === undefined && description === undefined && tags === undefined && newName === undefined) {
      throw usageError('nothing to change', 'edit')
    }
    const { password } = readPassword(context)
    const dataKey = openVault(password)
    if (access !== undefined || description !== undefined || tags !== undefined) {
      await audited('update', [name], () => update(dataKey, name, { description, tags, ai_access: access }))
    }
    if (newName !== undefined) await audited('rename', [name, newName], () => rename(dataKey, name, newName))
    dataKey.fill(0)
    line(context, `Changed ${newName ?? name}.`)
    return 0
  },
}

export const rm: Command = {
  name: 'rm',
  summary: 'Delete a key',
  needs: 'password',
  usage: 'akbun-keychain rm <name> [--password-stdin]',
  description: 'Deletes the key. vault.json.bak keeps the previous file until the next write.',
  positionals: [NAME_ARG],
  options: [PASSWORD_STDIN],
  examples: ['akbun-keychain rm old/token', 'printf "%s\\n" "$PW" | akbun-keychain rm old/token --password-stdin'],
  exitCodes: [[0, 'Deleted.'], [4, 'Wrong password.'], [7, 'No such key.']],
  ifFails: [FAIL_DENIED, FAIL_NOT_FOUND],
  async run(context) {
    const [name] = context.args.positionals
    const { password } = readPassword(context)
    const dataKey = openVault(password)
    await audited('delete', [name], () => remove(dataKey, name))
    dataKey.fill(0)
    line(context, `Deleted ${name}.`)
    return 0
  },
}
