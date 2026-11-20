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

export function apiKeyProblem(key: string): string | null {
  const value = key.trim()
  if (/\s/.test(value)) return 'claude_api_key must be one token without spaces'
  return value.length > 512 ? 'claude_api_key is longer than 512 characters' : null
}

// An empty key removes the file, so ANTHROPIC_API_KEY from the environment applies again.
export function saveApiKey(config: Pick<Config, 'home'>, key: string): string | null {
  const value = key.trim()
  const path = apiKeyPath(config)
  if (!value) {
    rmSync(path, { force: true })
    return null
  }
  const problem = apiKeyProblem(value)
  if (problem) return problem
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${value}\n`, { mode: 0o600 })
  chmodSync(path, 0o600) // mode applies only when the file is created
  return null
}

// The OpenAI API key saved the same way, for OpenAI bots that sign in with a key.
export function openaiKeyPath(config: Pick<Config, 'home'>): string {
  return join(config.home, 'data', 'openai-api-key')
}

export function readOpenaiKey(config: Pick<Config, 'home'>): string | undefined {
  try {
    return readFileSync(openaiKeyPath(config), 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

export function saveOpenaiKey(config: Pick<Config, 'home'>, key: string): void {
  const value = key.trim()
  const path = openaiKeyPath(config)
  if (!value) {
    rmSync(path, { force: true })
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${value}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
}
