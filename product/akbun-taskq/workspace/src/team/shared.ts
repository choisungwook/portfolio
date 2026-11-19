import { mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Config } from '../config.ts'
import { newId } from '../ids.ts'
import { under } from '../worker/paths.ts'

// The shared folder: TASKQ_HOME/shared, readable and writable by every bot (it is added to each session's directories,
// like a mounted drive) and by the user through the Shared folder view. Attachments land in attachments/<day>/.

export const UPLOAD_LIMIT = 20 * 1024 * 1024

export function sharedDir(config: Config): string {
  const dir = join(config.home, 'shared')
  mkdirSync(join(dir, 'attachments'), { recursive: true })
  return dir
}

// A path inside the shared folder, given relative to it. `..`, absolute paths and symlinks that lead out are refused.
export function resolveShared(config: Config, path: string): string | null {
  const root = realpathSync(sharedDir(config))
  const target = resolve(root, path)
  if (!under(target, root)) return null
  try {
    return under(realpathSync(target), root) ? target : null
  } catch {
    return under(dirname(target), root) ? target : null
  }
}

// An existing file in the shared folder, given absolute or relative to it, as its path relative to the folder; null when
// it is outside the folder or not a file. Bots hand files over by these paths.
export function sharedRelative(config: Config, path: string): string | null {
  let root: string
  let real: string
  try {
    root = realpathSync(sharedDir(config))
    real = realpathSync(isAbsolute(path) ? path : resolve(root, path))
    if (!statSync(real).isFile()) return null
  } catch {
    return null
  }
  if (!under(real, root)) return null
  return relative(root, real).split(sep).join('/')
}

function safeName(name: string): string {
  // Control characters, slashes and backslashes are dropped; a leading dot would hide the file.
  const base = [...basename(name)].filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f && ch !== '/' && ch !== '\\').join('').replace(/^\.+/, '').trim()
  return (base || 'file').slice(0, 120)
}

// Saves an uploaded file under attachments/<YYYY-MM-DD>/<id>-<name> and returns its path relative to the shared folder.
export function saveAttachment(config: Config, name: string, data: Buffer): string {
  const day = new Date().toISOString().slice(0, 10)
  const rel = join('attachments', day, `${newId()}-${safeName(name)}`)
  const abs = join(sharedDir(config), rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, data, { flag: 'wx' })
  return rel.split(sep).join('/')
}

export interface SharedEntry { name: string; path: string; dir: boolean; size: number; modified: number }

export function listShared(config: Config, dir: string): SharedEntry[] | null {
  const abs = resolveShared(config, dir || '.')
  if (!abs) return null
  const root = realpathSync(sharedDir(config))
  return readdirSync(abs, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink())
    .map((entry) => {
      const full = join(abs, entry.name)
      const stat = statSync(full)
      return { name: entry.name, path: relative(root, full).split(sep).join('/'), dir: entry.isDirectory(), size: stat.size, modified: Math.floor(stat.mtimeMs / 1000) }
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
    .slice(0, 500)
}
