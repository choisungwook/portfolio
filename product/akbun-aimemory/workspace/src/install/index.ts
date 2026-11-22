import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type AgentName = 'claude' | 'codex' | 'kiro' | 'antigravity'
export const SUPPORTED_AGENTS: readonly AgentName[] = ['claude', 'codex', 'kiro', 'antigravity']

export interface InstallOptions {
  homeDir?: string
  command?: string
  skillSource?: string
}

export interface InstallResult {
  agent: AgentName
  hookConfigPath: string
  skillPath: string
  hooksAdded: number
  skillInstalled: boolean
}

export function isSupportedAgent(value: string): value is AgentName {
  return (SUPPORTED_AGENTS as readonly string[]).includes(value)
}

function defaultSkillSource(): string {
  return join(import.meta.dirname, '..', '..', 'skills', 'aimemory', 'SKILL.md')
}

function readJsonObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  const text = readFileSync(file, 'utf8').trim()
  if (!text) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function writeJsonObject(file: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function hasCommandInGroupedHooks(entries: unknown[], command: string): boolean {
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const rec = entry as Record<string, unknown>
    if (rec.command === command) return true
    if (Array.isArray(rec.hooks)) {
      for (const h of rec.hooks) {
        if (h && typeof h === 'object' && (h as Record<string, unknown>).command === command) return true
      }
    }
  }
  return false
}

// Claude Code (~/.claude/settings.json) and Codex (~/.codex/hooks.json) share the matcher/hooks wrapper format.
function installClaudeOrCodex(file: string, command: string): number {
  const doc = readJsonObject(file)
  const hooks = (doc.hooks && typeof doc.hooks === 'object' && !Array.isArray(doc.hooks))
    ? { ...(doc.hooks as Record<string, unknown>) }
    : {}
  const events: { name: string; matcher?: string }[] = [
    { name: 'SessionStart' },
    { name: 'UserPromptSubmit' },
    { name: 'PostToolUse', matcher: '*' },
    { name: 'Stop' },
    { name: 'SessionEnd' },
  ]
  let added = 0
  for (const ev of events) {
    const existing = Array.isArray(hooks[ev.name]) ? [...(hooks[ev.name] as unknown[])] : []
    if (hasCommandInGroupedHooks(existing, command)) {
      hooks[ev.name] = existing
      continue
    }
    const item: Record<string, unknown> = ev.matcher
      ? { matcher: ev.matcher, hooks: [{ type: 'command', command }] }
      : { hooks: [{ type: 'command', command }] }
    existing.push(item)
    hooks[ev.name] = existing
    added++
  }
  doc.hooks = hooks
  writeJsonObject(file, doc)
  return added
}

// Kiro agent JSON (~/.kiro/agents/default.json) stores hooks as flat arrays of { command, matcher? }.
function installKiro(file: string, command: string): number {
  const doc = readJsonObject(file)
  const hooks = (doc.hooks && typeof doc.hooks === 'object' && !Array.isArray(doc.hooks))
    ? { ...(doc.hooks as Record<string, unknown>) }
    : {}
  const events: { name: string; matcher?: string }[] = [
    { name: 'agentSpawn' },
    { name: 'userPromptSubmit' },
    { name: 'postToolUse', matcher: '*' },
    { name: 'stop' },
  ]
  let added = 0
  for (const ev of events) {
    const existing = Array.isArray(hooks[ev.name]) ? [...(hooks[ev.name] as unknown[])] : []
    if (hasCommandInGroupedHooks(existing, command)) {
      hooks[ev.name] = existing
      continue
    }
    existing.push(ev.matcher ? { matcher: ev.matcher, command } : { command })
    hooks[ev.name] = existing
    added++
  }
  doc.hooks = hooks
  writeJsonObject(file, doc)
  return added
}

// Antigravity (~/.gemini/config/hooks.json) uses named top-level hook specs:
// SessionStart/PreInvocation/Stop are flat handler arrays; PostToolUse uses { matcher, hooks }.
function installAntigravity(file: string, command: string): number {
  const doc = readJsonObject(file)
  const spec = (doc.aimemory && typeof doc.aimemory === 'object' && !Array.isArray(doc.aimemory))
    ? { ...(doc.aimemory as Record<string, unknown>) }
    : {}
  let added = 0

  for (const name of ['SessionStart', 'PreInvocation', 'Stop']) {
    const existing = Array.isArray(spec[name]) ? [...(spec[name] as unknown[])] : []
    if (!hasCommandInGroupedHooks(existing, command)) {
      existing.push({ type: 'command', command })
      added++
    }
    spec[name] = existing
  }

  const postTool = Array.isArray(spec.PostToolUse) ? [...(spec.PostToolUse as unknown[])] : []
  if (!hasCommandInGroupedHooks(postTool, command)) {
    postTool.push({ matcher: '*', hooks: [{ type: 'command', command }] })
    added++
  }
  spec.PostToolUse = postTool

  doc.aimemory = spec
  writeJsonObject(file, doc)
  return added
}

function pathsFor(agent: AgentName, homeDir: string): { hookConfigPath: string; skillPath: string } {
  switch (agent) {
    case 'claude':
      return {
        hookConfigPath: join(homeDir, '.claude', 'settings.json'),
        skillPath: join(homeDir, '.claude', 'skills', 'aimemory', 'SKILL.md'),
      }
    case 'codex':
      return {
        hookConfigPath: join(homeDir, '.codex', 'hooks.json'),
        skillPath: join(homeDir, '.codex', 'skills', 'aimemory', 'SKILL.md'),
      }
    case 'kiro':
      return {
        hookConfigPath: join(homeDir, '.kiro', 'agents', 'default.json'),
        skillPath: join(homeDir, '.kiro', 'skills', 'aimemory', 'SKILL.md'),
      }
    case 'antigravity':
      return {
        hookConfigPath: join(homeDir, '.gemini', 'config', 'hooks.json'),
        skillPath: join(homeDir, '.gemini', 'config', 'skills', 'aimemory', 'SKILL.md'),
      }
  }
}

export function installAgent(agent: AgentName, opts: InstallOptions = {}): InstallResult {
  const homeDir = opts.homeDir ?? homedir()
  const command = opts.command ?? `aimem hook --agent ${agent}`
  const skillSrc = opts.skillSource ?? defaultSkillSource()
  const { hookConfigPath, skillPath } = pathsFor(agent, homeDir)

  let hooksAdded = 0
  if (agent === 'claude' || agent === 'codex') hooksAdded = installClaudeOrCodex(hookConfigPath, command)
  else if (agent === 'kiro') hooksAdded = installKiro(hookConfigPath, command)
  else hooksAdded = installAntigravity(hookConfigPath, command)

  const skillText = readFileSync(skillSrc, 'utf8')
  const alreadySame = existsSync(skillPath) && readFileSync(skillPath, 'utf8') === skillText
  if (!alreadySame) {
    mkdirSync(dirname(skillPath), { recursive: true })
    writeFileSync(skillPath, skillText, 'utf8')
  }

  return { agent, hookConfigPath, skillPath, hooksAdded, skillInstalled: true }
}
