import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import { resourcePath } from '../resources.ts'
import pkg from '../../package.json' with { type: 'json' }

// The taskq skill every bot carries: what taskq is, the running version, where the manual of that version is, and how
// to make workflows. Its source is skills/taskq/SKILL.md and manual.md in this product; taskq writes both into
// TASKQ_HOME/builtin-skills/taskq on every start, so an update (a new binary) brings its own skill and manual and no
// bot keeps an old one. It is not in the skill registry: the user can read it in Plugins but not remove or edit it.
export const BUILTIN_SKILL = 'taskq'

export interface BuiltinSkillInfo { name: string; version: string; path: string; manual: string; updated_at: number; skill_md: string }

export const builtinSkillDir = (config: Config) => join(config.home, 'builtin-skills', BUILTIN_SKILL)

function source(relative: string): string {
  const file = resourcePath(relative)
  if (!file || !existsSync(file)) throw new Error(`${relative} is missing from this build`)
  return readFileSync(file, 'utf8')
}

// The manual of the running version, as text (for `taskq manual`, GET /manual and the skill folder).
export function manualText(): string {
  return source('manual.md')
}

export function installBuiltinSkill(config: Config): BuiltinSkillInfo {
  const dir = builtinSkillDir(config)
  mkdirSync(dir, { recursive: true })
  const manual = join(dir, 'manual.md')
  writeFileSync(manual, manualText())
  const skill = source('skills/taskq/SKILL.md')
    .replaceAll('{{version}}', pkg.version).replaceAll('{{home}}', config.home).replaceAll('{{manual}}', manual)
  writeFileSync(join(dir, 'SKILL.md'), skill)
  return builtinSkillInfo(config)
}

export function builtinSkillInfo(config: Config): BuiltinSkillInfo {
  const dir = builtinSkillDir(config)
  if (!existsSync(join(dir, 'SKILL.md'))) return installBuiltinSkill(config)
  const file = join(dir, 'SKILL.md')
  return { name: BUILTIN_SKILL, version: pkg.version, path: dir, manual: join(dir, 'manual.md'), updated_at: Math.floor(statSync(file).mtimeMs / 1000), skill_md: readFileSync(file, 'utf8') }
}
