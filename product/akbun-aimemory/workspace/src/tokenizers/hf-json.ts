import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { Tokenizer } from '../tokenizer.ts'

interface HfNormalizer {
  type?: string
  normalizers?: HfNormalizer[]
  pattern?: { String?: string; Regex?: string }
  content?: string
}

interface HfPreTokenizer {
  type?: string
  pretokenizers?: HfPreTokenizer[]
  replacement?: string
  add_prefix_space?: boolean
  prepend_scheme?: 'always' | 'first' | 'never'
}

interface HfAddedToken {
  content?: string
  special?: boolean
}

interface HfUnigramModel {
  type: 'Unigram'
  unk_id?: number
  vocab: [string, number][]
}

interface HfBpeModel {
  type: 'BPE'
  vocab: Record<string, number>
  merges: (string | [string, string])[]
  byte_fallback?: boolean
}

interface HfTokenizerJson {
  normalizer?: HfNormalizer | null
  pre_tokenizer?: HfPreTokenizer | null
  added_tokens?: HfAddedToken[]
  model?: HfUnigramModel | HfBpeModel | { type?: string }
}

const METASPACE = '\u2581'
const GPT_SPACE = '\u0120'
const CACHE_LIMIT = 16_384
const CLEAN_TOKEN = /[\p{L}\p{N}]/u

function applyNormalizer(text: string, norm?: HfNormalizer | null): string {
  if (!norm?.type) return text.normalize('NFKC')
  switch (norm.type) {
    case 'Sequence':
      return (norm.normalizers ?? []).reduce((acc, item) => applyNormalizer(acc, item), text)
    case 'NFKC':
      return text.normalize('NFKC')
    case 'NFC':
      return text.normalize('NFC')
    case 'NFD':
      return text.normalize('NFD')
    case 'NFKD':
      return text.normalize('NFKD')
    case 'Lowercase':
      return text.toLowerCase()
    case 'Strip':
      return text.trim()
    case 'Replace': {
      const replacement = norm.content ?? ''
      if (norm.pattern?.String !== undefined) return text.split(norm.pattern.String).join(replacement)
      if (norm.pattern?.Regex !== undefined) return text.replace(new RegExp(norm.pattern.Regex, 'gu'), replacement)
      return text
    }
    default:
      return text
  }
}

function detectPreMode(pre?: HfPreTokenizer | null, hasMetaspace = false, hasGptSpace = false): { marker: string; prefixFirst: boolean } {
  const flat: HfPreTokenizer[] = []
  const visit = (node?: HfPreTokenizer | null): void => {
    if (!node) return
    if (node.type === 'Sequence' && Array.isArray(node.pretokenizers)) {
      for (const child of node.pretokenizers) visit(child)
    } else {
      flat.push(node)
    }
  }
  visit(pre)
  const meta = flat.find((p) => p.type === 'Metaspace')
  if (meta) {
    const marker = meta.replacement ?? METASPACE
    const prefixFirst = meta.prepend_scheme ? meta.prepend_scheme !== 'never' : meta.add_prefix_space !== false
    return { marker, prefixFirst }
  }
  const byteLevel = flat.find((p) => p.type === 'ByteLevel')
  if (byteLevel) {
    return { marker: GPT_SPACE, prefixFirst: byteLevel.add_prefix_space === true }
  }
  if (hasMetaspace) return { marker: METASPACE, prefixFirst: true }
  if (hasGptSpace) return { marker: GPT_SPACE, prefixFirst: false }
  return { marker: '', prefixFirst: false }
}

function splitChunks(text: string, marker: string, prefixFirst: boolean): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  if (!marker) return words
  return words.map((word, index) => (index === 0 && !prefixFirst ? word : `${marker}${word}`))
}

function cleanPieces(pieces: string[], specials: Set<string>, marker: string): string[] {
  const out: string[] = []
  for (const raw of pieces) {
    if (specials.has(raw)) continue
    let token = raw
    if (marker && token.startsWith(marker)) token = token.slice(marker.length)
    else if (token.startsWith(METASPACE)) token = token.slice(1)
    else if (token.startsWith(GPT_SPACE)) token = token.slice(1)
    token = token.trim().toLowerCase()
    if (!token || !CLEAN_TOKEN.test(token)) continue
    out.push(token)
  }
  return out
}

interface TrieNode {
  children: Map<string, TrieNode>
  score?: number
}

function buildUnigramTokenizer(model: HfUnigramModel, json: HfTokenizerJson, specials: Set<string>): (text: string) => string[] {
  const root: TrieNode = { children: new Map() }
  let minScore = 0
  let hasMetaspace = false
  let hasGptSpace = false

  for (let i = 0; i < model.vocab.length; i++) {
    const [piece, score] = model.vocab[i]
    if (i === model.unk_id || !piece || specials.has(piece)) continue
    if (score < minScore) minScore = score
    if (piece.startsWith(METASPACE)) hasMetaspace = true
    if (piece.startsWith(GPT_SPACE)) hasGptSpace = true
    let node = root
    for (const ch of piece) {
      let next = node.children.get(ch)
      if (!next) {
        next = { children: new Map() }
        node.children.set(ch, next)
      }
      node = next
    }
    if (node.score === undefined || score > node.score) node.score = score
  }

  const oovPenalty = minScore - 10
  const { marker, prefixFirst } = detectPreMode(json.pre_tokenizer, hasMetaspace, hasGptSpace)
  const cache = new Map<string, string[]>()

  const segmentChunk = (chunk: string): string[] => {
    const hit = cache.get(chunk)
    if (hit) return hit
    const chars = [...chunk]
    const n = chars.length
    const bestScore = new Float64Array(n + 1)
    bestScore.fill(Number.NEGATIVE_INFINITY)
    bestScore[0] = 0
    const bestPrev = new Int32Array(n + 1)
    bestPrev.fill(-1)

    for (let i = 0; i < n; i++) {
      const base = bestScore[i]
      if (base === Number.NEGATIVE_INFINITY) continue
      let node: TrieNode | undefined = root
      let matched = false
      for (let j = i; j < n; j++) {
        node = node.children.get(chars[j])
        if (!node) break
        if (node.score !== undefined) {
          matched = true
          const candidate = base + node.score
          if (candidate > bestScore[j + 1]) {
            bestScore[j + 1] = candidate
            bestPrev[j + 1] = i
          }
        }
      }
      if (!matched) {
        const candidate = base + oovPenalty
        if (candidate > bestScore[i + 1]) {
          bestScore[i + 1] = candidate
          bestPrev[i + 1] = i
        }
      }
    }

    const pieces: string[] = []
    let pos = n
    while (pos > 0) {
      const prev = bestPrev[pos]
      const start = prev >= 0 ? prev : pos - 1
      pieces.push(chars.slice(start, pos).join(''))
      pos = start
    }
    pieces.reverse()
    const cleaned = cleanPieces(pieces, specials, marker)
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(chunk, cleaned)
    return cleaned
  }

  return (text: string) => {
    const normalized = applyNormalizer(text, json.normalizer)
    const chunks = splitChunks(normalized, marker, prefixFirst)
    const out: string[] = []
    for (const chunk of chunks) out.push(...segmentChunk(chunk))
    return out
  }
}

function buildBpeTokenizer(model: HfBpeModel, json: HfTokenizerJson, specials: Set<string>): (text: string) => string[] {
  const ranks = new Map<string, number>()
  model.merges.forEach((entry, index) => {
    const pair = Array.isArray(entry) ? `${entry[0]}\0${entry[1]}` : entry.replace(' ', '\0')
    ranks.set(pair, index)
  })

  const vocabKeys = Object.keys(model.vocab)
  const hasMetaspace = vocabKeys.some((k) => k.startsWith(METASPACE))
  const hasGptSpace = vocabKeys.some((k) => k.startsWith(GPT_SPACE))
  const { marker, prefixFirst } = detectPreMode(json.pre_tokenizer, hasMetaspace, hasGptSpace)
  const cache = new Map<string, string[]>()

  const encodeChunk = (chunk: string): string[] => {
    const hit = cache.get(chunk)
    if (hit) return hit
    let symbols = [...chunk]
    while (symbols.length > 1) {
      let bestRank = Number.POSITIVE_INFINITY
      let bestPair = ''
      for (let i = 0; i < symbols.length - 1; i++) {
        const key = `${symbols[i]}\0${symbols[i + 1]}`
        const rank = ranks.get(key)
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank
          bestPair = key
        }
      }
      if (!bestPair) break
      const [first, second] = bestPair.split('\0')
      const merged: string[] = []
      let i = 0
      while (i < symbols.length) {
        if (i < symbols.length - 1 && symbols[i] === first && symbols[i + 1] === second) {
          merged.push(first + second)
          i += 2
        } else {
          merged.push(symbols[i])
          i += 1
        }
      }
      symbols = merged
    }
    const cleaned = cleanPieces(symbols, specials, marker)
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(chunk, cleaned)
    return cleaned
  }

  return (text: string) => {
    const normalized = applyNormalizer(text, json.normalizer)
    const chunks = splitChunks(normalized, marker, prefixFirst)
    const out: string[] = []
    for (const chunk of chunks) out.push(...encodeChunk(chunk))
    return out
  }
}

export function resolveTokenizerPath(filePath: string, baseDir?: string): string {
  if (isAbsolute(filePath) || existsSync(filePath) || !baseDir) return filePath
  return join(baseDir, filePath)
}

export function loadHfJsonTokenizer(filePath: string, baseDir?: string): Tokenizer {
  const resolved = resolveTokenizerPath(filePath, baseDir)
  const raw = readFileSync(resolved, 'utf8')
  const json = JSON.parse(raw) as HfTokenizerJson
  const specials = new Set<string>(['<unk>', '<s>', '</s>', '<pad>', '<bos>', '<eos>', '[UNK]', '[CLS]', '[SEP]', '[PAD]'])
  for (const item of json.added_tokens ?? []) {
    if (item.special && item.content) specials.add(item.content)
  }

  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12)
  const id = `hf-json:${basename(resolved)}:${hash}`
  const model = json.model
  if (!model?.type) throw new Error(`unsupported tokenizer.json: missing model.type (${resolved})`)
  if (model.type === 'Unigram') {
    return { id, tokenize: buildUnigramTokenizer(model as HfUnigramModel, json, specials) }
  }
  if (model.type === 'BPE') {
    return { id, tokenize: buildBpeTokenizer(model as HfBpeModel, json, specials) }
  }
  throw new Error(`unsupported HuggingFace tokenizer model type "${model.type}" (expected Unigram or BPE)`)
}
