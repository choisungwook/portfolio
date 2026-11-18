import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { entryOk, listEntries, type RegistryKind } from '../db/bot-registry.ts'
import { getAgent, postMessage, SYSTEM, type TeamAgent } from '../db/team.ts'
import { under } from '../worker/paths.ts'

// What a bot loads is a snapshot: the selected skills and plugins are copied into the bot's folder when its settings
// are saved or the user picks Reload. A turn loads the snapshot, so editing a skill folder does not change a bot in the
// middle of its work, and Reload is the moment the change takes effect. Selected skills become one local plugin
// (skills/<name>/SKILL.md) because the SDK loads skills from plugins or settings, and settings are off for bots.

export interface LoadReport {
  kind: RegistryKind
  loaded: string[]
  missing: string[]     // selected, but the registry entry is gone or its folder no longer has SKILL.md or a manifest
}

const SKIP = new Set(['node_modules', '.git'])

// Outside the bot's folder on purpose: the bot can write its own folder (sandbox or not), and a plugin it could edit
// would load hooks and MCP servers that run outside its tool calls, past the gate. The gate stops any write here.
export function snapshotsDir(config: Config): string {
  return join(config.home, 'bot-plugins')
}

function snapshotRoot(config: Config, bot: string): string {
  return join(snapshotsDir(config), bot)
}

export function skillsPluginDir(config: Config, bot: string): string {
  return join(snapshotRoot(config, bot), 'skills-plugin')
}

export function pluginsDir(config: Config, bot: string): string {
  return join(snapshotRoot(config, bot), 'plugins')
}

// Clears one snapshot folder, which is about to be removed recursively. Every component from TASKQ_HOME/bot-plugins
// down to the folder is checked with lstat, and the real path must still be inside it; a symlink anywhere refuses the
// reload, so nothing outside TASKQ_HOME is ever deleted.
function reset(config: Config, dir: string): void {
  const root = snapshotsDir(config)
  mkdirSync(root, { recursive: true })
  if (!under(dir, root)) throw new Error(`refusing to clear ${dir}`)
  let path = root
  for (const part of relative(root, dir).split(sep)) {
    path = join(path, part)
    if (existsSync(path) || isLink(path)) {
      if (isLink(path)) throw new Error(`refusing to reload: ${path} is a symbolic link`)
    }
  }
  if (existsSync(dir) && !under(realpathSync(dir), realpathSync(root))) throw new Error(`refusing to clear ${dir}: it resolves outside ${root}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function copy(from: string, to: string): void {
  cpSync(from, to, { recursive: true, dereference: true, filter: (src) => !SKIP.has(basename(src)) })
}

export function reload(db: Db, config: Config, bot: string, kind: RegistryKind): LoadReport {
  const agent = getAgent(db, bot)
  if (!agent) throw new Error(`no bot named ${bot}`)
  const registry = new Map(listEntries(db, kind).map((entry) => [entry.name, entry]))
  const selected = kind === 'skill' ? agent.skills : agent.plugins
  const report: LoadReport = { kind, loaded: [], missing: [] }
  const target = kind === 'skill' ? skillsPluginDir(config, bot) : pluginsDir(config, bot)
  reset(config, target)
  if (kind === 'skill') {
    mkdirSync(join(target, '.claude-plugin'), { recursive: true })
    writeFileSync(join(target, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: `taskq-${bot}-skills`, description: `Skills selected for ${bot}` })}\n`)
  }
  for (const name of selected) {
    const entry = registry.get(name)
    if (!entry || !entryOk(kind, entry.path)) {
      report.missing.push(name)
      continue
    }
    copy(entry.path, kind === 'skill' ? join(target, 'skills', name) : join(target, name))
    report.loaded.push(name)
  }
  return report
}

export function reloadAll(db: Db, config: Config, bot: string): LoadReport[] {
  return [reload(db, config, bot, 'skill'), reload(db, config, bot, 'plugin')]
}

// The plugin folders a turn passes to the SDK. A snapshot that was never built is built now.
export function pluginPaths(db: Db, config: Config, bot: string): string[] {
  const agent = getAgent(db, bot)
  if (!agent) return []
  if (!existsSync(skillsPluginDir(config, bot))) reloadAll(db, config, bot)
  const paths = agent.skills.length > 0 ? [skillsPluginDir(config, bot)] : []
  for (const name of agent.plugins) {
    const dir = join(pluginsDir(config, bot), name)
    if (existsSync(dir)) paths.push(dir)
  }
  return paths
}

// Shown in the bot's conversation as a note that is already read, so it does not start a turn.
export function noteReload(db: Db, bot: string, reports: LoadReport[]): string {
  const text = reports.map((r) => `${r.kind === 'skill' ? 'Skills' : 'Plugins'} reloaded: ${r.loaded.join(', ') || 'none'}${r.missing.length ? `; missing: ${r.missing.join(', ')}` : ''}`).join('\n')
  const id = postMessage(db, { sender: SYSTEM, recipient: bot, body: text })
  db.prepare('UPDATE team_messages SET read_at = created_at WHERE id = ?').run(id)
  return text
}

// The bot's skills as folders of its own copy, for a backend that has no plugin loader (OpenAI): the bot reads
// SKILL.md with read_skill when it needs one.
export function skillsFor(db: Db, config: Config, agent: TeamAgent): { name: string; description: string; path: string }[] {
  if (agent.skills.length === 0) return []
  if (!existsSync(skillsPluginDir(config, agent.name))) reloadAll(db, config, agent.name)
  const described = new Map(listEntries(db, 'skill').map((e) => [e.name, e.description ?? '']))
  return agent.skills
    .map((name) => ({ name, description: described.get(name) ?? '', path: join(skillsPluginDir(config, agent.name), 'skills', name) }))
    .filter((s) => existsSync(join(s.path, 'SKILL.md')))
}
