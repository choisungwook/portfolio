import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Config } from '../config.ts'
import { HttpError } from './http.ts'

// A skill proposal lands beside SKILL.md as proposed-<unix seconds>.md. SKILL.md itself is never a proposal target.
const PROPOSED_FILE = /^proposed-\d+\.md$/

function allowedRoots(config: Config): { root: string; skill: boolean }[] {
  const roots = [{ root: join(config.home, 'memory'), skill: false }]
  if (config.skillsDir) roots.push({ root: resolve(config.home, config.skillsDir), skill: true })
  return roots
}

// A proposal may only write under memory/ or skillsDir. Every existing component on the path is lstat'ed, so a
// symlink (dangling ones included) is rejected. Missing parents are created by appendTarget, inside the root only.
export function resolveTarget(config: Config, targetPath: string): string {
  const target = resolve(config.home, targetPath)
  for (const { root, skill } of allowedRoots(config)) {
    if (!existsSync(root)) continue
    const rel = relative(root, target)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue
    if (skill && !PROPOSED_FILE.test(basename(target))) throw new HttpError(400, 'a skill target must be proposed-<unix seconds>.md')
    assertNoSymlink(root, rel)
    return target
  }
  throw new HttpError(400, 'target_path must be inside memory/ or skillsDir')
}

function assertNoSymlink(root: string, rel: string): void {
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    let stat: Stats
    try {
      stat = lstatSync(current)
    } catch {
      return // this component and everything below it does not exist yet
    }
    if (stat.isSymbolicLink()) throw new HttpError(400, 'target_path must not pass through a symlink')
  }
}

// Appends without following a symlink that appeared after the check.
export function appendTarget(target: string, text: string): void {
  mkdirSync(dirname(target), { recursive: true })
  let fd: number
  try {
    fd = openSync(target, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new HttpError(400, 'target_path must not be a symlink')
    throw error
  }
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}
