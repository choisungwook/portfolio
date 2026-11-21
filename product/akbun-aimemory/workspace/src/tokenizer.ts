import { execFileSync } from 'node:child_process'
import { loadHfJsonTokenizer } from './tokenizers/hf-json.ts'

// Tokens drive both the lexical index (FTS5) and the hashed vectors, so changing the tokenizer needs `aimem reindex`.
// No model is involved: the builtin splits by script, `hf-json` loads a HuggingFace tokenizer.json (Unigram/BPE), and
// `command` runs any open-source tokenizer the user installs (SentencePiece, BlingFire, ...) as a child process.
export type TokenizerConfig =
  | { type: 'builtin' }
  | { type: 'hf-json'; path: string }
  | { type: 'command'; command: string; args?: string[] }

export interface Tokenizer { id: string; tokenize(text: string): string[] }

const WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30fc\u3005]+|\p{Script=Hangul}+|[\p{L}\p{N}_]+/gu
const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30fc\u3005]/u
const HANGUL = /^\p{Script=Hangul}/u

function bigrams(run: string): string[] {
  const chars = [...run]
  if (chars.length < 2) return chars
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1])
}

// The prolonged sound mark (ー) and the iteration mark (々) are Common script but belong inside Japanese words.
// Latin and digits stay words. Chinese and Japanese have no spaces, so they become character bigrams. Korean keeps the
// whole word and adds bigrams, so a word with a particle (메모리를) still matches the bare noun (메모리).
export function builtinTokenize(text: string): string[] {
  const out: string[] = []
  for (const run of text.normalize('NFKC').toLowerCase().match(WORD) ?? []) {
    if (CJK.test(run)) out.push(...bigrams(run))
    else if (HANGUL.test(run)) { out.push(run); if ([...run].length > 2) out.push(...bigrams(run)) }
    else out.push(run)
  }
  return out
}

export function makeTokenizer(config: TokenizerConfig, baseDir?: string): Tokenizer {
  if (config.type === 'builtin') return { id: 'builtin-v1', tokenize: builtinTokenize }
  if (config.type === 'hf-json') return loadHfJsonTokenizer(config.path, baseDir)
  const { command, args = [] } = config
  return {
    id: `command:${command} ${args.join(' ')}`,
    // Output is a JSON array of strings or whitespace-separated tokens.
    tokenize(text) {
      const out = execFileSync(command, args, { input: text, encoding: 'utf8', timeout: 10_000 }).trim()
      const tokens: unknown = out.startsWith('[') ? JSON.parse(out) : out.split(/\s+/)
      return (tokens as unknown[]).map(String).filter(Boolean).map((t) => t.toLowerCase())
    },
  }
}
