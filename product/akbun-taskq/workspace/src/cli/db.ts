import { copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { backupsDir, exportDatabase, importFromFile } from '../db/backup.ts'
import type { Command } from './types.ts'

// taskq db export [FILE]: a consistent copy of the database (kept in data/backups, and copied to FILE when given).
// taskq db import FILE: checks FILE and parks it; the next `taskq run` swaps it in and keeps the replaced database.
export const db: Command = ({ db: database, config }, args) => {
  const [action, file] = args
  if (action === 'export') {
    const backup = exportDatabase(database, config)
    const kept = join(backupsDir(config), backup.name)
    if (file) copyFileSync(kept, resolve(file))
    console.log(file ? resolve(file) : kept)
    return
  }
  if (action === 'import' && file) {
    importFromFile(config, resolve(file))
    console.log('checked; restart taskq (stop taskq run and start it again) to use it. The current database is kept in data/backups.')
    return
  }
  throw new Error('usage: taskq db export [FILE] | db import FILE')
}
