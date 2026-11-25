// App settings in ~/PianoCoach/config/settings.json. The API key is stored encrypted by the caller (Electron safeStorage).

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export type Settings = {
  vision: 'codex' | 'claude-api'
  codexPath: string
  codexModel: string
  claudeModel: string
  apiKeyEncrypted?: string
}

export const DEFAULT_SETTINGS: Settings = { vision: 'codex', codexPath: 'codex', codexModel: '', claudeModel: 'claude-opus-5-5' }

const file = (root: string) => path.join(root, 'config', 'settings.json')

export async function loadSettings(root: string): Promise<Settings> {
  const saved = await fs.readFile(file(root), 'utf8').then((text) => JSON.parse(text) as Partial<Settings>).catch(() => ({}))
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveSettings(root: string, settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(file(root)), { recursive: true })
  await fs.writeFile(file(root), JSON.stringify(settings, null, 2))
}

// Validates what the renderer sends; unknown fields are dropped.
export function mergeSettings(current: Settings, input: unknown): Settings {
  const value = (input ?? {}) as Record<string, unknown>
  const next = { ...current }
  if (value.vision === 'codex' || value.vision === 'claude-api') next.vision = value.vision
  for (const key of ['codexPath', 'codexModel', 'claudeModel'] as const) {
    if (typeof value[key] === 'string') next[key] = (value[key] as string).trim()
  }
  if (!next.codexPath) next.codexPath = DEFAULT_SETTINGS.codexPath
  if (!next.claudeModel) next.claudeModel = DEFAULT_SETTINGS.claudeModel
  return next
}
