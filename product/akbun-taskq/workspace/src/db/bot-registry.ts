import { execFile } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { promisify } from 'node:util'
import { basename, isAbsolute, join } from 'node:path'
import type { Db } from './open.ts'
import { inspectSkill, skillFileOk, SkillError } from '../skills/inspect.ts'
import { nowSec } from '../time.ts'

// The global skill and plugin registry. A folder is registered once in the settings; each bot then picks the entries it
// loads. Rows store the real path, so a later symlink swap does not change what was registered.

export type RegistryKind = 'skill' | 'plugin'

export interface RegistryEntry {
  name: string
  path: string
  description: string | null
  ok: boolean               // the folder still has its SKILL.md or plugin manifest
}

const TABLE: Record<RegistryKind, string> = { skill: 'bot_skills', plugin: 'bot_plugins' }
const PLUGIN_MANIFEST = join('.claude-plugin', 'plugin.json')
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export function pluginOk(dir: string): boolean {
  return existsSync(join(dir, PLUGIN_MANIFEST))
}

export function entryOk(kind: RegistryKind, dir: string): boolean {
  return kind === 'skill' ? skillFileOk(dir) : pluginOk(dir)
}

// A plugin folder holds .claude-plugin/plugin.json with at least a name; its skills, commands and hooks load from there.
export function inspectPlugin(path: string): { name: string; path: string; description: string } {
  if (!isAbsolute(path)) throw new SkillError(400, 'path must be an absolute path to a plugin folder')
  let dir: string
  try {
    dir = realpathSync(path)
  } catch {
    throw new SkillError(400, `path does not exist: ${path}`)
  }
  if (!statSync(dir).isDirectory()) throw new SkillError(400, 'path must be a folder')
  if (!pluginOk(dir)) throw new SkillError(400, `${PLUGIN_MANIFEST} is missing`)
  let manifest: { name?: unknown; description?: unknown }
  try {
    manifest = JSON.parse(readFileSync(join(dir, PLUGIN_MANIFEST), 'utf8'))
  } catch {
    throw new SkillError(400, `${PLUGIN_MANIFEST} is not valid JSON`)
  }
  const name = typeof manifest.name === 'string' ? manifest.name : basename(dir)
  if (!NAME.test(name)) throw new SkillError(400, `plugin name must be lowercase words joined by hyphens: ${name}`)
  return { name, path: dir, description: typeof manifest.description === 'string' ? manifest.description.slice(0, 200) : '' }
}

export function registerEntry(db: Db, home: string, kind: RegistryKind, path: string): RegistryEntry {
  const info = kind === 'skill' ? inspectSkill(home, path) : inspectPlugin(path)
  const table = TABLE[kind]
  if (db.prepare(`SELECT 1 FROM ${table} WHERE name = ? OR path = ?`).get(info.name, info.path)) {
    throw new SkillError(409, `a ${kind} with the name ${info.name} or that path is already registered`)
  }
  db.prepare(`INSERT INTO ${table} (name, path, description, created_at) VALUES (?, ?, ?, ?)`).run(info.name, info.path, info.description, nowSec())
  return { ...info, ok: true }
}

// Removes the entry and takes it off every bot that loads it.
export function removeEntry(db: Db, kind: RegistryKind, name: string): boolean {
  const table = TABLE[kind]
  if (db.prepare(`DELETE FROM ${table} WHERE name = ?`).run(name).changes !== 1) return false
  const column = kind === 'skill' ? 'skills' : 'plugins'
  for (const row of db.prepare(`SELECT name, ${column} AS list FROM team_agents`).all()) {
    const list = (JSON.parse(String(row.list)) as string[]).filter((item) => item !== name)
    db.prepare(`UPDATE team_agents SET ${column} = ? WHERE name = ?`).run(JSON.stringify(list), String(row.name))
  }
  return true
}

export function listEntries(db: Db, kind: RegistryKind): RegistryEntry[] {
  return (db.prepare(`SELECT name, path, description FROM ${TABLE[kind]} ORDER BY name`).all() as { name: string; path: string; description: string | null }[])
    .map((row) => ({ ...row, ok: entryOk(kind, row.path) }))
}

export function knownNames(db: Db): { skills: Set<string>; plugins: Set<string> } {
  return {
    skills: new Set(listEntries(db, 'skill').map((e) => e.name)),
    plugins: new Set(listEntries(db, 'plugin').map((e) => e.name)),
  }
}

const run = promisify(execFile)

export function botsUsing(db: Db, kind: RegistryKind, name: string): string[] {
  const column = kind === 'skill' ? 'skills' : 'plugins'
  return db.prepare(`SELECT name, ${column} AS list FROM team_agents`).all()
    .filter((row) => (JSON.parse(String(row.list)) as string[]).includes(name)).map((row) => String(row.name))
}

// A git checkout is pulled (fast-forward only, so local changes are never merged or overwritten). Anything else has no
// source to update from; its description is re-read so an edited SKILL.md or manifest shows up.
export async function updateEntry(db: Db, kind: RegistryKind, name: string): Promise<{ method: 'git' | 'reread'; output: string } | undefined> {
  const row = db.prepare(`SELECT path FROM ${TABLE[kind]} WHERE name = ?`).get(name)
  if (!row) return undefined
  const path = String(row.path)
  let method: 'git' | 'reread' = 'reread'
  let output = 'not a git checkout; re-read the description'
  if (existsSync(join(path, '.git'))) {
    method = 'git'
    try {
      const { stdout, stderr } = await run('git', ['-C', path, 'pull', '--ff-only'], { timeout: 60_000 })
      output = `${stdout}${stderr}`.trim().slice(0, 2000) || 'up to date'
    } catch (error) {
      output = `git pull failed: ${(error as { stderr?: string }).stderr?.trim().slice(0, 500) ?? String(error)}`
    }
  }
  if (entryOk(kind, path)) {
    try {
      const info = kind === 'plugin' ? inspectPlugin(path) : null
      const description = info?.description ?? descriptionOfSkill(path)
      db.prepare(`UPDATE ${TABLE[kind]} SET description = ? WHERE name = ?`).run(description, name)
    } catch {
      // A broken manifest keeps the old description; the registry shows the entry as it was.
    }
  }
  return { method, output }
}

function descriptionOfSkill(path: string): string | null {
  const text = readFileSync(join(path, 'SKILL.md'), 'utf8')
  return /^description:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^["']|["']$/g, '').slice(0, 200) ?? null
}
