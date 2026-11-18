import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import {
  deleteAccessSkill, findAccessSkill, findAccessSkillByPath, insertAccessSkill, listAccessSkills, openTasksUsing,
  type AccessSkillRow,
} from '../db/access-skills.ts'
import { nowSec } from '../time.ts'
import { inspectSkill, skillFileOk, SkillError } from './inspect.ts'

const IN_USE_LISTED = 5

// Registers a skill folder. The same function serves the API and the CLI.
export function registerSkill(db: Db, home: string, path: string): AccessSkillRow {
  const info = inspectSkill(home, path)
  if (findAccessSkill(db, info.name)) throw new SkillError(409, `an access skill named ${info.name} is already registered`)
  if (findAccessSkillByPath(db, info.path)) throw new SkillError(409, `${info.path} is already registered`)
  const row = { ...info, added_at: nowSec() }
  try {
    insertAccessSkill(db, row)
  } catch (error) {
    if (/UNIQUE/.test(String(error))) throw new SkillError(409, `access skill ${info.name} is already registered`)
    throw error
  }
  return row
}

// Removes the registration only. The skill's files are never touched.
export function removeSkill(db: Db, name: string): void {
  inTransaction(db, () => {
    if (!findAccessSkill(db, name)) throw new SkillError(404, `no access skill named ${name}`)
    const ids = openTasksUsing(db, name)
    if (ids.length > 0) {
      const more = ids.length > IN_USE_LISTED ? ' and more' : ''
      throw new SkillError(409, `access skill ${name} is used by open tasks: ${ids.slice(0, IN_USE_LISTED).join(', ')}${more}`)
    }
    deleteAccessSkill(db, name)
  })
}

// The registered skills for the settings view. ok is false when SKILL.md is gone from the stored path.
export function skillRows(db: Db): { name: string; path: string; description: string; ok: boolean }[] {
  return listAccessSkills(db).map((row) => ({
    name: row.name, path: row.path, description: row.description, ok: skillFileOk(row.path),
  }))
}

export function hasAccessSkill(db: Db, name: string): boolean {
  return findAccessSkill(db, name) !== undefined
}

// The run-time check. A missing skill fails the run before any session starts.
export function resolveAccessSkill(db: Db, name: string | undefined): { path?: string; missing?: string } {
  if (name === undefined) return {}
  const row = findAccessSkill(db, name)
  if (!row) return { missing: `access skill ${name} is not registered` }
  if (!skillFileOk(row.path)) return { missing: `access skill ${name} is missing at ${row.path}` }
  return { path: row.path }
}

// The config keys the settings view shows. Anything else in the config stays out of the API.
export const CONFIG_KEYS: (keyof Config)[] = [
  'agent', 'provider', 'awsRegion', 'inferenceProfile', 'caBundle', 'model', 'maxConcurrent', 'staleTtlSec', 'heartbeatSec', 'pollSec', 'port',
  'maxTurns', 'maxBudgetUsd', 'autoMode', 'sandbox', 'prodLockKeys', 'trustedRepos', 'skillsDir', 'retrospect', 'team',
]

export function configView(config: Config): Record<string, unknown> {
  return Object.fromEntries(CONFIG_KEYS.map((key) => [key, config[key] ?? null]))
}
