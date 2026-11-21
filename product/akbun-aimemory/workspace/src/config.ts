import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TokenizerConfig } from './tokenizer.ts'

// The indexer is the model that will summarise raw observations (not wired yet). The default is the cheapest
// reasoning setting; OpenAI is the other expected provider.
export interface IndexerConfig { provider: 'claude' | 'openai' | 'none'; model: string; effort: 'low' | 'medium' | 'high' }

export interface Config {
  home: string
  tokenizer: TokenizerConfig
  indexer: IndexerConfig
  contextLimit: number   // memories printed by `aimem context`
  halfLifeDays: number   // recency decay of search scores
  caBundle?: string      // extra root CA PEM for TLS-inspecting networks, used by network calls
}

export const CONFIG_FILE = 'aimemory.config.json'

export function loadConfig(home = process.env.AIMEMORY_HOME || join(homedir(), '.aimemory')): Config {
  const file = join(home, CONFIG_FILE)
  const user = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Partial<Config> : {}
  return {
    home,
    tokenizer: user.tokenizer ?? { type: 'builtin' },
    indexer: { provider: 'claude', model: 'claude-haiku-5-5', effort: 'low', ...user.indexer },
    contextLimit: user.contextLimit ?? 8,
    halfLifeDays: user.halfLifeDays ?? 30,
    caBundle: user.caBundle,
  }
}
