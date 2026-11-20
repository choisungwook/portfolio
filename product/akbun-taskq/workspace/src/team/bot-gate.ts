import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { TeamAgent } from '../db/team.ts'
import { tamperOf } from '../worker/gate.ts'
import { realPath, under } from '../worker/paths.ts'
import { resolve } from 'node:path'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const TASKQ_CLI = /(^|[\s;&|(`'"/])taskq(\s|$|['"`;&|)])/

// The per-bot command gate. Two layers:
// 1. Always on, for every bot: a call that reaches taskq itself ends the turn and pauses the bots. File tools are
//    checked by resolved path (tamperOf). Bash is checked by its text: a command that names taskq's data directory,
//    its database or its config file stops the turn, and one that names the user's ~/.claude is refused. A text check
//    can be fooled (a variable, a script written first); the sandbox is the boundary that cannot. With the sandbox off,
//    the default, this layer is what stands between a bot and its own limits.
// 2. Per bot, empty by default: Bash commands containing one of the bot's blocked_commands patterns are refused. It
//    prevents accidents; it is not a boundary, since a command can be spelled another way.

// 3. Ask first: a call that cannot be undone (pushing, publishing, deploying, deleting cloud resources) or that matches
//    one of the bot's ask_first rules does not run and does not fail silently: it becomes a request in Must check, and
//    once the user approves it, that exact call runs once. Reversible work (drafts, files, summaries) runs alone.
//    bypassPermissions skips the built-in list but not the bot's own rules.

export type GateVerdict = { action: 'allow' } | { action: 'deny'; reason: string } | { action: 'stop'; reason: string }

// Records and spends approvals for one bot; the hub builds it over the database.
export interface ApprovalBroker {
  consume(tool: string, command: string): boolean
  request(tool: string, command: string, rule: string): number
}

// Commands whose effect leaves the machine or cannot be taken back. Each comes twice, so options between the tool and
// its subcommand (git -C repo push, kubectl -n prod delete) still match. Like blocked commands this prevents accidents
// and is not a boundary: a script or a variable can spell a command another way.
const IRREVERSIBLE: [string, string][] = [
  ['git', 'push'], ['npm', 'publish'], ['pnpm', 'publish'], ['yarn', 'publish'], ['gh', 'pr merge'], ['gh', 'release create'],
  ['docker', 'push'], ['terraform', 'apply'], ['terraform', 'destroy'], ['kubectl', 'apply'], ['kubectl', 'delete'],
  ['helm', 'install'], ['helm', 'upgrade'], ['helm', 'uninstall'], ['aws', 'delete-'], ['aws', 'terminate-'],
]
export const DEFAULT_ASK_FIRST = IRREVERSIBLE.flatMap(([tool, sub]) => [`${tool} ${sub}*`, `${tool} * ${sub}*`])
// A call longer than this cannot be approved: the user must be able to read all of what they approve.
export const APPROVABLE_CHARS = 4000

// The rule a call matches, if any. `tool:<pattern>` rules match the tool name (an MCP tool such as tool:mcp__slack__*);
// the others match a Bash command.
export function askFirstRule(agent: TeamAgent, tool: string, input: Record<string, unknown>): string | null {
  const own = agent.ask_first ?? []
  const toolRules = own.filter((rule) => rule.startsWith('tool:'))
  for (const rule of toolRules) {
    if (rule.slice(5).trim() && new RegExp(`^${commandPattern(rule.slice(5)).source}$`).test(tool)) return rule
  }
  if (tool !== 'Bash' || typeof input.command !== 'string') return null
  const commandRules = own.filter((rule) => !rule.startsWith('tool:'))
  const rules = agent.permission_mode === 'bypassPermissions' ? commandRules : [...commandRules, ...DEFAULT_ASK_FIRST]
  return blockedBy(input.command, rules)
}

export function callText(tool: string, input: Record<string, unknown>): string {
  return tool === 'Bash' && typeof input.command === 'string' ? input.command : JSON.stringify(input)
}

// `*` matches any text and everything else is literal. The pattern may appear anywhere in the command, so a prefix
// (sudo, a path, an env assignment, a subshell, bash -c, a second line) does not hide it.
export function commandPattern(pattern: string): RegExp {
  const escaped = pattern.trim().replace(/\s+/g, ' ').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(escaped, 's')
}

export function blockedBy(command: string, patterns: string[]): string | null {
  const text = command.replace(/\\\n/g, ' ').replace(/[ \t]+/g, ' ')
  for (const pattern of patterns) {
    if (pattern.trim() && commandPattern(pattern).test(text)) return pattern
  }
  return null
}

// The spellings of taskq's own files a shell command could use.
function protectedNames(config: Config): { stop: string[]; deny: string[] } {
  const data = join(config.home, 'data')
  const plugins = join(config.home, 'bot-plugins')
  const home = homedir()
  return {
    stop: [...new Set([data, realPath(data), 'taskq.db', 'taskq.config.json', plugins, realPath(plugins)])],
    deny: [...new Set([join(home, '.claude'), realPath(join(home, '.claude')), '~/.claude', '$HOME/.claude', '${HOME}/.claude', 'CLAUDE_CONFIG_DIR'])],
  }
}

export function botGate(config: Config, agent: TeamAgent, cwd: string, tool: string, input: Record<string, unknown>, approvals?: ApprovalBroker): GateVerdict {
  const tamper = tamperOf(tool, input, { cwd, outputs: join(config.home, 'outputs'), dataDir: join(config.home, 'data') })
  if (tamper !== null) return { action: 'stop', reason: tamper }
  // The bots' skill and plugin copies load as plugins; writing them would run code outside the gate on the next turn.
  if (WRITE_TOOLS.has(tool)) {
    const target = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
    const plugins = realPath(join(config.home, 'bot-plugins'))
    if (target && under(realPath(resolve(cwd, target)), plugins)) return { action: 'stop', reason: `${tool} tried to change a bot's plugin copy` }
  }
  if (tool === 'Bash' && typeof input.command === 'string') {
    const names = protectedNames(config)
    const named = names.stop.find((name) => input.command !== undefined && String(input.command).includes(name))
    if (named) return { action: 'stop', reason: `a shell command named taskq's own data or config (${named})` }
    if (names.deny.some((name) => String(input.command).includes(name))) {
      return { action: 'deny', reason: 'Commands that touch the user\'s Claude Code settings (~/.claude) are not allowed for bots.' }
    }
    // The taskq CLI could change a bot's own permissions, the limits or approvals. Bots use their team tools instead.
    if (TASKQ_CLI.test(String(input.command))) return { action: 'deny', reason: 'Bots do not run the taskq command; use your team tools.' }
    const pattern = blockedBy(input.command, agent.blocked_commands)
    if (pattern !== null) return { action: 'deny', reason: `This bot's settings block commands containing "${pattern}".` }
  }
  const rule = askFirstRule(agent, tool, input)
  if (rule !== null) {
    const text = callText(tool, input)
    if (text.length > APPROVABLE_CHARS) {
      return { action: 'deny', reason: `This call needs the user's approval (rule "${rule}") and is too long to approve (over ${APPROVABLE_CHARS} characters). Split it into shorter commands.` }
    }
    if (approvals?.consume(tool, text)) return { action: 'allow' }
    const id = approvals?.request(tool, text, rule)
    return {
      action: 'deny',
      reason: id === undefined
        ? `This call needs the user's approval first (rule "${rule}"). Ask the orchestrator to get it.`
        : `This call needs the user's approval first (rule "${rule}"). Request #${id} is waiting in the user's Must check list. Do not retry it now: you will get a message when it is decided, and then this exact call may run once. Continue with other work or end your turn.`,
    }
  }
  return { action: 'allow' }
}
