import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Config } from '../../config.ts'

// The Anthropic API key saved from Settings > Connections. It is plain text with mode 0600, like ~/.aws/credentials:
// bots run unattended, so any key that could decrypt it would sit on the same disk and add nothing. It lives in its
// own file, not the database, so a database copy or export never carries it.
export function apiKeyPath(config: Pick<Config, 'home'>): string {
  return join(config.home, 'data', 'anthropic-api-key')
}

export function readApiKey(config: Pick<Config, 'home'>): string | undefined {
  try {
    return readFileSync(apiKeyPath(config), 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

// An empty key removes the file, so ANTHROPIC_API_KEY from the environment applies again.
export function saveApiKey(config: Pick<Config, 'home'>, key: string): string | null {
  const value = key.trim()
  const path = apiKeyPath(config)
  if (!value) {
    rmSync(path, { force: true })
    return null
  }
  if (/\s/.test(value) || value.length > 512) return 'claude_api_key must be one token without spaces'
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${value}\n`, { mode: 0o600 })
  chmodSync(path, 0o600) // mode applies only when the file is created
  return null
}
