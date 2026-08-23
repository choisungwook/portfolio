import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppSettings, ThemePreference } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = { theme: 'system', forceRemoveWorktree: false }
const THEMES: ThemePreference[] = ['system', 'light', 'dark']

function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const theme = THEMES.includes(parsed.theme as ThemePreference)
      ? (parsed.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme
    return { theme, forceRemoveWorktree: parsed.forceRemoveWorktree === true }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveTheme(theme: ThemePreference): Promise<AppSettings> {
  const current = await loadSettings()
  const settings: AppSettings = { ...current, theme: THEMES.includes(theme) ? theme : 'system' }
  await fs.mkdir(path.dirname(settingsFilePath()), { recursive: true })
  await fs.writeFile(settingsFilePath(), JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}

export async function saveForceRemoveWorktree(forceRemoveWorktree: boolean): Promise<AppSettings> {
  const current = await loadSettings()
  const settings: AppSettings = { ...current, forceRemoveWorktree: forceRemoveWorktree === true }
  await fs.mkdir(path.dirname(settingsFilePath()), { recursive: true })
  await fs.writeFile(settingsFilePath(), JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}
