// Path checks for the gate. A path resolves through symlinks on its deepest existing ancestor before it is compared,
// so a link inside outputs/ that points at ~/.ssh is judged where it really points.
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

export interface Places { dataDir: string }

const GLOB = /[*?[{]/
const HOME = realPath(homedir())
const SENSITIVE_DIRS = ['.aws', '.ssh', '.gnupg', '.kube', '.docker', '.config/gh', '.claude'].map((dir) => join(HOME, dir))
const SKILLS = join(HOME, '.claude', 'skills')
const NETRC = join(HOME, '.netrc')
// Names a glob might match. The same list builds probe paths for a glob's literal directory.
const NAMES = ['credentials', 'id_rsa', 'id_ed25519', 'x.pem', 'x.key', '.env', '.env.local', 'taskq.config.json']
const SENSITIVE_NAME = /^(credentials|id_rsa|id_ed25519|taskq\.config\.json)$|\.(pem|key)$/

export function realPath(path: string, depth = 0): string {
  let existing = path
  const rest: string[] = []
  while (!lexists(existing)) {
    const parent = dirname(existing)
    if (parent === existing) break
    rest.unshift(basename(existing))
    existing = parent
  }
  try {
    return join(realpathSync(existing), ...rest)
  } catch {
    // A dangling symlink: follow its target, which may not exist yet.
    if (depth < 32 && lexists(existing) && lstatSync(existing).isSymbolicLink()) {
      return join(realPath(resolve(dirname(existing), readlinkSync(existing)), depth + 1), ...rest)
    }
    return join(existing, ...rest)
  }
}

// ~ expands to the home directory; a relative path is resolved from base. A glob keeps its wildcards, with the literal
// directory before the first wildcard resolved through symlinks.
export function resolvePath(base: string, path: string): string {
  const expanded = path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  const abs = resolve(base, expanded)
  const cut = abs.search(GLOB)
  if (cut < 0) return realPath(abs)
  const dirEnd = abs.lastIndexOf('/', cut)
  return join(realPath(abs.slice(0, dirEnd) || '/'), abs.slice(dirEnd + 1))
}

export function under(path: string, root: string): boolean {
  const prefix = root.endsWith(sep) ? root : root + sep
  return path === root || path.startsWith(prefix)
}

// True when a real path, or a glob that could match one, is under dataDir or a sensitive location.
export function blocked(path: string, write: boolean, places: Places): boolean {
  if (GLOB.test(path)) return globReaches(path, write, places)
  if (under(path, places.dataDir) || NETRC === path) return true
  if (sensitiveDir(path, write)) return true
  return path.split(sep).some((segment) => SENSITIVE_NAME.test(segment) || segment === '.env' || segment.startsWith('.env.'))
}

function sensitiveDir(path: string, write: boolean): boolean {
  if (!write && under(path, SKILLS)) return false
  return SENSITIVE_DIRS.some((dir) => under(path, dir))
}

// A glob is blocked when its literal directory is home or above, is itself blocked, or when a probe under a sensitive
// location or a sensitive name matches it. The probes are a conservative stand-in for matching the whole tree.
function globReaches(pattern: string, write: boolean, places: Places): boolean {
  const cut = pattern.search(GLOB)
  const litDir = pattern.slice(0, pattern.lastIndexOf('/', cut)) || '/'
  if (litDir === '/' || HOME === litDir || HOME.startsWith(litDir + sep)) return true
  if (blocked(litDir, write, places)) return true
  const regex = new RegExp(`^${globSource(pattern)}$`)
  const probes = [places.dataDir, ...SENSITIVE_DIRS].flatMap((dir) => [join(dir, 'x'), ...NAMES.map((name) => join(dir, name))])
  return [...probes, ...NAMES.map((name) => join(litDir, name))]
    .some((probe) => regex.test(probe) && blocked(probe, write, places))
}

// Glob syntax to a regex source: * and ? stay in one segment, ** crosses segments, [..] and {a,b} are kept.
function globSource(pattern: string): string {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)?'
      i += 2
    } else if (pattern.startsWith('**', i)) {
      out += '.*'
      i += 1
    } else if (ch === '*') out += '[^/]*'
    else if (ch === '?') out += '[^/]'
    else if (ch === '[' && pattern.indexOf(']', i) > i) {
      const end = pattern.indexOf(']', i)
      const body = pattern.slice(i + 1, end)
      out += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
      i = end
    } else if (ch === '{' && pattern.indexOf('}', i) > i) {
      const end = pattern.indexOf('}', i)
      out += `(?:${pattern.slice(i + 1, end).split(',').map(globSource).join('|')})`
      i = end
    } else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return out
}

function lexists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}
