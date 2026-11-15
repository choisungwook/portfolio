import { resolve } from 'node:path'
import { discoverSkills, skillRoots } from '../skills/discover.ts'
import { registerSkill, removeSkill, skillRows } from '../skills/registry.ts'
import type { Command } from './types.ts'

const USAGE = 'usage: taskq skills list | add PATH | remove NAME | discover'

// Same validation as the API: the CLI only resolves a relative path against the current directory first.
export const skills: Command = ({ config, db }, args) => {
  const [sub, ...rest] = args
  if (sub === 'list') {
    for (const row of skillRows(db)) {
      console.log(`${row.name}  ${row.ok ? 'ok' : 'missing'}  ${row.path}  ${row.description}`)
    }
  } else if (sub === 'add' && rest.length === 1) {
    const row = registerSkill(db, config.home, resolve(rest[0]))
    console.log(`added ${row.name}  ${row.path}`)
  } else if (sub === 'remove' && rest.length === 1) {
    removeSkill(db, rest[0])
    console.log(`removed ${rest[0]}`)
  } else if (sub === 'discover' && rest.length === 0) {
    for (const found of discoverSkills(db, config, skillRoots(config))) {
      console.log(`${found.registered ? 'registered' : 'available'}  ${found.name}  ${found.path}  ${found.description}`)
    }
  } else {
    throw new Error(USAGE)
  }
}
