import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { Db } from '../db/open.ts'
import { inspectPlugin, pluginOk, type RegistryEntry } from '../db/bot-registry.ts'
import { SkillError } from '../skills/inspect.ts'
import { nowSec } from '../time.ts'
import type { CatalogPlugin } from './plugin-catalog.ts'

// Installs a marketplace plugin: git fetches only the commit the marketplace lists (or its ref, or the default branch
// when it pins neither) into TASKQ_HOME/plugins/<name>, with a sparse checkout when the plugin is a folder inside a
// larger repository, then registers the folder like one added by path. Installing again replaces the folder with the
// marketplace's current commit, which is how an installed plugin is updated. Nothing runs from the fetched files here;
// bots load a copy only after the user picks the plugin in a bot's settings.
export type Git = (args: string[], cwd: string) => Promise<void>

const exec = promisify(execFile)
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

export const runGit: Git = async (args, cwd) => {
  try {
    await exec('git', args, { cwd, timeout: 180_000, maxBuffer: 1 << 20 })
  } catch (error) {
    const e = error as { code?: string; stderr?: string }
    if (e.code === 'ENOENT') throw new SkillError(500, 'git was not found on this machine; install git to install plugins')
    throw new SkillError(502, `git ${args[0]} failed: ${(e.stderr ?? String(error)).trim().slice(-400)}`)
  }
}

export function pluginsDir(home: string): string {
  return join(home, 'plugins')
}

// True for a folder taskq installed itself, which Update reinstalls and Remove deletes.
// Registered paths are real paths, so the plugins folder is resolved too (on macOS a temp home sits under /private).
function realPluginsDir(home: string): string {
  try {
    return realpathSync(pluginsDir(home))
  } catch {
    return pluginsDir(home)
  }
}

export function installedByTaskq(home: string, path: string): boolean {
  const rel = relative(realPluginsDir(home), path)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep)
}

// One install per name at a time: two would race on the same folder and registry row.
const busy = new Set<string>()

export async function installPlugin(db: Db, home: string, plugin: CatalogPlugin, git: Git = runGit): Promise<RegistryEntry & { replaced: boolean }> {
  if (!NAME.test(plugin.name)) throw new SkillError(400, `plugin name is not one taskq can install: ${plugin.name}`)
  if (busy.has(plugin.name)) throw new SkillError(409, `${plugin.name} is already being installed`)
  busy.add(plugin.name)
  try {
    return await fetchAndRegister(db, home, plugin, git)
  } finally {
    busy.delete(plugin.name)
  }
}

async function fetchAndRegister(db: Db, home: string, plugin: CatalogPlugin, git: Git): Promise<RegistryEntry & { replaced: boolean }> {
  const source = plugin.install
  if (!source) throw new SkillError(400, `${plugin.name} has no git source taskq can fetch`)
  const existing = db.prepare('SELECT path FROM bot_plugins WHERE name = ?').get(plugin.name) as { path: string } | undefined
  if (existing && !installedByTaskq(home, existing.path)) {
    throw new SkillError(409, `a plugin named ${plugin.name} is already registered from ${existing.path}; remove it first`)
  }

  const root = pluginsDir(home)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const target = join(root, plugin.name)
  const staging = join(root, `.${plugin.name}.${process.pid}.${Date.now()}`)
  mkdirSync(staging)
  try {
    await git(['init', '-q'], staging)
    await git(['remote', 'add', 'origin', source.url], staging)
    if (source.path) await git(['sparse-checkout', 'set', '--no-cone', `/${source.path}/`], staging)
    await git(['fetch', '-q', '--depth', '1', 'origin', source.sha ?? source.ref ?? 'HEAD'], staging)
    await git(['checkout', '-q', 'FETCH_HEAD'], staging)
    const folder = join(staging, source.path)
    if (!existsSync(folder)) throw new SkillError(502, `${source.path} is not in ${source.url}`)
    if (!pluginOk(folder)) {
      mkdirSync(join(folder, '.claude-plugin'), { recursive: true })
      writeFileSync(join(folder, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ ...plugin.manifest, name: plugin.name }, null, 2)}\n`)
    }
    rmSync(target, { recursive: true, force: true })
    renameSync(staging, target)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }

  // The marketplace name is the plugin's identity, as in Claude Code; its own manifest may call it something shorter.
  const info = { ...inspectPlugin(realpathSync(join(target, source.path))), name: plugin.name }
  if (existing) {
    db.prepare('UPDATE bot_plugins SET path = ?, description = ? WHERE name = ?').run(info.path, info.description, plugin.name)
  } else {
    db.prepare('INSERT INTO bot_plugins (name, path, description, created_at) VALUES (?, ?, ?, ?)').run(info.name, info.path, info.description, nowSec())
  }
  return { ...info, ok: true, replaced: existing !== undefined }
}

// The folder taskq installed for this plugin (plugins/<name>), removed with its registry row. Anything else, including
// a folder someone registered by path from inside plugins/, is left alone.
export function deleteInstalled(home: string, name: string, path: string): void {
  if (!NAME.test(name) || relative(realPluginsDir(home), path).split(sep)[0] !== name) return
  rmSync(join(realPluginsDir(home), name), { recursive: true, force: true })
}
