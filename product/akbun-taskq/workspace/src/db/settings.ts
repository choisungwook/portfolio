import type { Db } from './open.ts'
import { getMeta, setMeta } from './meta.ts'

// Settings the user changes in the app. They live in the SQLite file under TASKQ_HOME, so they survive a restart and
// an upgrade (a new binary opens the same file). taskq.config.json gives the starting values; a value saved here wins.

export type Language = 'ko' | 'en'
export type ThemeMode = 'system' | 'dark' | 'light'

export function language(db: Db): Language {
  return getMeta(db, 'ui_language') === 'en' ? 'en' : 'ko'
}

export function themeMode(db: Db): ThemeMode {
  const value = getMeta(db, 'ui_theme')
  return value === 'dark' || value === 'system' ? value : 'light'
}
