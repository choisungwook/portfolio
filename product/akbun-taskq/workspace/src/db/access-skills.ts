import type { Db } from './open.ts'

export interface AccessSkillRow { name: string; path: string; description: string; added_at: number }

// Statuses in which a task may still run and so still needs its access skill.
const OPEN_SQL = `status IN ('draft', 'ready', 'running', 'needs_approval', 'needs_auth')`

export function listAccessSkills(db: Db): AccessSkillRow[] {
  return db.prepare('SELECT name, path, description, added_at FROM access_skills ORDER BY name').all() as unknown as AccessSkillRow[]
}

export function findAccessSkill(db: Db, name: string): AccessSkillRow | undefined {
  return db.prepare('SELECT name, path, description, added_at FROM access_skills WHERE name = ?').get(name) as unknown as AccessSkillRow | undefined
}

export function findAccessSkillByPath(db: Db, path: string): AccessSkillRow | undefined {
  return db.prepare('SELECT name, path, description, added_at FROM access_skills WHERE path = ?').get(path) as unknown as AccessSkillRow | undefined
}

export function insertAccessSkill(db: Db, row: AccessSkillRow): void {
  db.prepare('INSERT INTO access_skills (name, path, description, added_at) VALUES (?, ?, ?, ?)')
    .run(row.name, row.path, row.description, row.added_at)
}

export function deleteAccessSkill(db: Db, name: string): void {
  db.prepare('DELETE FROM access_skills WHERE name = ?').run(name)
}

// Ids of the tasks that still reference the skill, oldest first.
export function openTasksUsing(db: Db, name: string): string[] {
  const rows = db.prepare(`SELECT id FROM tasks WHERE ${OPEN_SQL} AND json_extract(data, '$.access_skill') = ?
    ORDER BY created_at, id`).all(name) as { id: string }[]
  return rows.map((row) => row.id)
}
