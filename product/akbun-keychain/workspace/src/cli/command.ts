import { EXIT_CODES, KeychainError, NEEDS_PASSWORD_MESSAGE } from '../core/errors.ts'
import type { Io } from './io.ts'

export type Needs = 'nothing' | 'session' | 'password' | 'session or password'

export interface OptionSpec {
  name: string
  type: 'string' | 'boolean'
  repeat?: boolean
  placeholder?: string
  default?: string
  description: string
}

export interface PositionalSpec {
  name: string
  description: string
  rest?: boolean
}

export interface Parsed {
  positionals: string[]
  rest: string[]
  options: Record<string, string | boolean | string[]>
}

export interface Context {
  io: Io
  args: Parsed
}

export interface Command {
  name: string
  summary: string
  needs: Needs
  hidden?: boolean
  usage: string
  description: string
  positionals: PositionalSpec[]
  options: OptionSpec[]
  examples: string[]
  exitCodes: [number, string][]
  // Exit code to the next action, for the "If it fails" section.
  ifFails: [number, string][]
  run: (context: Context) => Promise<number>
}

export const PASSWORD_STDIN: OptionSpec = {
  name: 'password-stdin',
  type: 'boolean',
  description: 'Read the root password from line 1 of stdin instead of the terminal.',
}

export const JSON_OPTION: OptionSpec = { name: 'json', type: 'boolean', description: 'Print JSON instead of text.' }

export const NEEDS_TEXT: Record<Needs, string> = {
  nothing: 'Nothing. An agent can run this.',
  session: 'An unlocked session. An agent can run this once the user has run `akbun-keychain unlock`.',
  password: 'The root password. An agent cannot run this; ask the user.',
  'session or password': 'An unlocked session, or the root password typed by the user.',
}

export const FAIL_LOCKED: [number, string] = [3, 'The vault is locked. Ask the user to run `akbun-keychain unlock` in a terminal. Do not retry.']
export const FAIL_DENIED: [number, string] = [4, 'Denied, or wrong password. Ask the user; an agent cannot get past this.']
export const FAIL_USAGE: [number, string] = [2, 'Usage error. Read this help and fix the arguments.']
export const FAIL_NOT_FOUND: [number, string] = [7, 'No such key. Run `akbun-keychain list` to see the names.']
export const FAIL_INTEGRITY: [number, string] = [5, 'vault.json failed authentication. Ask the user to run `akbun-keychain verify`.']
export const FAIL_LOCK_TIMEOUT: [number, string] = [6, 'Another process holds vault.lock. Retry in a few seconds.']

export function usageError(message: string, command?: string): KeychainError {
  return new KeychainError('USAGE', `${message}. Run: akbun-keychain ${command ? `${command} ` : ''}--help`)
}

export function needsPassword(): KeychainError {
  return new KeychainError('DENIED', NEEDS_PASSWORD_MESSAGE)
}

export function parseArgs(command: Command, argv: string[]): Parsed {
  const parsed: Parsed = { positionals: [], rest: [], options: {} }
  const byName = new Map(command.options.map((option) => [option.name, option]))
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (token === '--') {
      parsed.rest = argv.slice(index + 1)
      break
    }
    if (token.startsWith('--')) {
      const [name, inline] = token.slice(2).split(/=(.*)/s, 2)
      const spec = byName.get(name)
      if (!spec) throw usageError(`unknown option --${name}`, command.name)
      if (spec.type === 'boolean') {
        if (inline !== undefined) throw usageError(`--${name} takes no value`, command.name)
        parsed.options[name] = true
        continue
      }
      const value = inline ?? argv[++index]
      if (value === undefined) throw usageError(`--${name} needs a value`, command.name)
      if (spec.repeat) parsed.options[name] = [...((parsed.options[name] as string[] | undefined) ?? []), value]
      else parsed.options[name] = value
      continue
    }
    if (token.startsWith('-') && token !== '-') throw usageError(`unknown option ${token}`, command.name)
    parsed.positionals.push(token)
  }
  const fixed = command.positionals.filter((spec) => !spec.rest)
  if (parsed.positionals.length > fixed.length) throw usageError('too many arguments', command.name)
  if (parsed.positionals.length < fixed.length) throw usageError(`missing ${fixed[parsed.positionals.length].name}`, command.name)
  return parsed
}

export function option(parsed: Parsed, name: string): string | undefined {
  const value = parsed.options[name]
  return typeof value === 'string' ? value : undefined
}

export function flag(parsed: Parsed, name: string): boolean {
  return parsed.options[name] === true
}

export function list(parsed: Parsed, name: string): string[] | undefined {
  const value = parsed.options[name]
  return Array.isArray(value) ? value : undefined
}

export function parseDuration(text: string, command: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(text)
  if (!match) throw usageError(`invalid duration ${JSON.stringify(text)}: use a number with ms, s, m or h, like 30m`, command)
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2] as 'ms' | 's' | 'm' | 'h']
  const value = Number(match[1]) * scale
  if (value <= 0) throw usageError('duration must be positive', command)
  return value
}

export function exitCodeOf(error: unknown): number {
  return error instanceof KeychainError ? EXIT_CODES[error.code] : 1
}

const WIDTH = 80

export function wrap(text: string, indent = 2): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent + line.length + 1 + word.length > WIDTH) {
      lines.push(' '.repeat(indent) + line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(' '.repeat(indent) + line)
  return lines
}

function item(label: string, text: string): string[] {
  const head = `  ${label}`
  if (head.length + 2 + text.length <= WIDTH && !text.includes('\n')) return [`${head}  ${text}`]
  return [head, ...wrap(text, 6)]
}

export function commandHelp(command: Command): string {
  const lines: string[] = ['Usage:', ...wrap(command.usage), '', 'What it does:', ...wrap(command.description), '']
  lines.push('Needs:', ...wrap(NEEDS_TEXT[command.needs]), '', 'Arguments:')
  const argumentLines = [
    ...command.positionals.map((spec) => item(spec.rest ? `${spec.name}...` : `<${spec.name}>`, spec.description)),
    ...command.options.map((spec) => {
      const label = `--${spec.name}${spec.type === 'string' ? ` <${spec.placeholder ?? 'value'}>` : ''}${spec.repeat ? '...' : ''}`
      const text = spec.default ? `${spec.description} Default ${spec.default}.` : spec.description
      return item(label, text)
    }),
    item('--help', 'Print this help.'),
  ].flat()
  lines.push(...argumentLines, '', 'Examples:', ...command.examples.flatMap((example) => wrap(example)), '')
  lines.push('Exit codes:', ...command.exitCodes.flatMap(([code, text]) => item(String(code), text)), '')
  lines.push('If it fails:', ...command.ifFails.flatMap(([code, text]) => item(String(code), text)))
  return `${lines.join('\n')}\n`
}

export function commandJson(command: Command): unknown {
  return {
    name: command.name,
    summary: command.summary,
    needs: command.needs,
    usage: command.usage,
    arguments: [
      ...command.positionals.map((spec) => ({ name: spec.name, kind: spec.rest ? 'rest' : 'positional', type: 'string', description: spec.description })),
      ...command.options.map((spec) => ({
        name: `--${spec.name}`,
        kind: 'option',
        type: spec.type,
        repeat: spec.repeat ?? false,
        default: spec.default ?? null,
        description: spec.description,
      })),
    ],
    examples: command.examples,
    exit_codes: Object.fromEntries(command.exitCodes),
    if_fails: Object.fromEntries(command.ifFails),
  }
}
