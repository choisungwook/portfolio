import type { Config } from '../config.ts'
import type { TeamAgent } from '../db/team.ts'
import { tamperOf } from '../worker/gate.ts'
import { splitSegments } from '../worker/aws-guard.ts'
import { join } from 'node:path'

// The per-bot command gate. Two layers:
// 1. Always on: a call that reaches taskq itself (its data directory, its config, Claude Code settings, sandbox off)
//    ends the turn, as it ends a task run. Without it a bot could edit its own budget or approvals.
// 2. Per bot, empty by default: Bash commands matching one of the bot's blocked_commands patterns are refused.

export type GateVerdict = { action: 'allow' } | { action: 'deny'; reason: string } | { action: 'stop'; reason: string }

// `*` matches any text, everything else is literal, and the pattern must cover the whole command segment.
export function commandPattern(pattern: string): RegExp {
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`, 's')
}

// Each segment of a pipeline or list is checked on its own, so `cd x && rm -rf /` is caught by `rm -rf *`.
// A command the splitter cannot parse is checked whole.
export function blockedBy(command: string, patterns: string[]): string | null {
  const segments = splitSegments(command)?.map((words) => words.join(' ')) ?? [command]
  for (const pattern of patterns) {
    const regex = commandPattern(pattern)
    if (regex.test(command.trim()) || segments.some((segment) => regex.test(segment))) return pattern
  }
  return null
}

export function botGate(config: Config, agent: TeamAgent, cwd: string, tool: string, input: Record<string, unknown>): GateVerdict {
  const tamper = tamperOf(tool, input, { cwd, outputs: join(config.home, 'outputs'), dataDir: join(config.home, 'data') })
  if (tamper !== null) return { action: 'stop', reason: tamper }
  if (tool === 'Bash' && typeof input.command === 'string') {
    const pattern = blockedBy(input.command, agent.blocked_commands)
    if (pattern !== null) return { action: 'deny', reason: `This bot's settings block commands matching "${pattern}".` }
  }
  return { action: 'allow' }
}
