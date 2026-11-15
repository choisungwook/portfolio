import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { findAccessSkillByPath } from '../db/access-skills.ts'
import { inspectSkill, type SkillInfo } from './inspect.ts'

export const DISCOVER_CAP = 200

export interface DiscoveredSkill extends SkillInfo { registered: boolean }

// $CLAUDE_CONFIG_DIR/skills, or ~/.claude/skills, plus config.skillsDir when it is set.
export function skillRoots(config: Config, env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills')]
  if (config.skillsDir) roots.push(resolve(config.home, config.skillsDir))
  return roots
}

// Looks one level deep under each root. Every candidate goes through the same check as registration, so a symlinked
// folder is judged by where it really points. Entries that fail the check are skipped.
export function discoverSkills(db: Db, config: Config, roots: string[]): DiscoveredSkill[] {
  const found: DiscoveredSkill[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    let names: string[]
    try {
      names = readdirSync(root).sort()
    } catch {
      continue
    }
    for (const name of names) {
      if (found.length >= DISCOVER_CAP) return found
      let info: SkillInfo
      try {
        info = inspectSkill(config.home, join(root, name))
      } catch {
        continue
      }
      if (seen.has(info.path)) continue
      seen.add(info.path)
      found.push({ ...info, registered: findAccessSkillByPath(db, info.path) !== undefined })
    }
  }
  return found
}
