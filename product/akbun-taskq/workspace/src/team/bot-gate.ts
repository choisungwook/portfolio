import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { TeamAgent } from '../db/team.ts'
import { tamperOf } from '../worker/gate.ts'
import { realPath, under } from '../worker/paths.ts'
import { resolve } from 'node:path'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

// The per-bot command gate. Two layers:
// 1. Always on, for every bot: a call that reaches taskq itself ends the turn and pauses the bots. File tools are
//    checked by resolved path (tamperOf). Bash is checked by its text: a command that names taskq's data directory,
//    its database or its config file stops the turn, and one that names the user's ~/.claude is refused. A text check
//    can be fooled (a variable, a script written first); the sandbox is the boundary that cannot. With the sandbox off,
//    the default, this layer is what stands between a bot and its own budget.
// 2. Per bot, empty by default: Bash commands containing one of the bot's blocked_commands patterns are refused. It
//    prevents accidents; it is not a boundary, since a command can be spelled another way.

export type GateVerdict = { action: 'allow' } | { action: 'deny'; reason: string } | { action: 'stop'; reason: string }

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

export function botGate(config: Config, agent: TeamAgent, cwd: string, tool: string, input: Record<string, unknown>): GateVerdict {
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
    const pattern = blockedBy(input.command, agent.blocked_commands)
    if (pattern !== null) return { action: 'deny', reason: `This bot's settings block commands containing "${pattern}".` }
  }
  return { action: 'allow' }
}
