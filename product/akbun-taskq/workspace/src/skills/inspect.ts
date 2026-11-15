import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import { realPath, under } from '../worker/paths.ts'
import { readFrontmatter } from './frontmatter.ts'

export const SKILL_FILE = 'SKILL.md'
const SKILL_MAX_BYTES = 200_000
const DESCRIPTION_MAX = 200
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface SkillInfo { name: string; path: string; description: string }

// A failure with the HTTP status the API should answer with. The CLI prints the message.
export class SkillError extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, message: string) {
    super(message)
    this.status = status
  }
}

// True when SKILL.md is a regular file at the path. A symlinked SKILL.md does not count.
export function skillFileOk(dir: string): boolean {
  try {
    return lstatSync(join(dir, SKILL_FILE)).isFile()
  } catch {
    return false
  }
}

// Validates a skill folder for registration and returns its stored form: the realpath, the name and the description.
export function inspectSkill(home: string, path: string): SkillInfo {
  if (!isAbsolute(path)) throw new SkillError(400, 'path must be an absolute path to a skill folder')
  let dir: string
  try {
    dir = realpathSync(path)
  } catch {
    throw new SkillError(400, `path does not exist: ${path}`)
  }
  if (!statSync(dir).isDirectory()) throw new SkillError(400, 'path must be a directory')
  let stat
  try {
    stat = lstatSync(join(dir, SKILL_FILE))
  } catch {
    throw new SkillError(400, `${SKILL_FILE} not found in ${dir}`)
  }
  if (!stat.isFile()) throw new SkillError(400, `${SKILL_FILE} must be a regular file, not a symlink`)
  if (stat.size > SKILL_MAX_BYTES) throw new SkillError(400, `${SKILL_FILE} is larger than 200 kB`)
  for (const place of [join(home, 'data'), join(home, 'outputs')]) {
    if (under(dir, realPath(place))) throw new SkillError(400, 'a skill folder must not be inside the taskq data directory or outputs')
  }
  const meta = readFrontmatter(readFileSync(join(dir, SKILL_FILE), 'utf8'))
  const name = (meta.name || basename(dir)).toLowerCase()
  if (!NAME_PATTERN.test(name)) throw new SkillError(400, `skill name must match ${NAME_PATTERN.source}: ${name}`)
  const description = (meta.description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX)
  return { name, path: dir, description }
}
