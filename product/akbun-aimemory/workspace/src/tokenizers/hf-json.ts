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

// Standard GPT-2 / HuggingFace ByteLevel bytes_to_unicode bijective mapping.
const { BYTE_TO_CHAR, CHAR_TO_BYTE } = (() => {
  const bs: number[] = []
  for (let b = 33; b <= 126; b++) bs.push(b)
  for (let b = 161; b <= 172; b++) bs.push(b)
  for (let b = 174; b <= 255; b++) bs.push(b)
  const cs = [...bs]
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n++)
    }
  }
  const b2c: string[] = new Array(256)
  const c2b = new Map<string, number>()
  for (let i = 0; i < bs.length; i++) {
    const ch = String.fromCharCode(cs[i])
    b2c[bs[i]] = ch
    c2b.set(ch, bs[i])
  }
  return { BYTE_TO_CHAR: b2c, CHAR_TO_BYTE: c2b }
})()

function encodeByteLevel(text: string): string[] {
  const bytes = Buffer.from(text, 'utf8')
  const out: string[] = new Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = BYTE_TO_CHAR[bytes[i]]
  return out
}

function decodeByteLevel(piece: string): string {
  const bytes: number[] = []
  for (const ch of piece) {
    const b = CHAR_TO_BYTE.get(ch)
    if (b === undefined) return piece
    bytes.push(b)
  }
  return Buffer.from(bytes).toString('utf8')
}

// Compile the normalizer tree once at load time so regexes are validated upfront and not recompiled per call.
function compileNormalizer(norm?: HfNormalizer | null): (text: string) => string {
  if (!norm?.type) return (text) => text.normalize('NFKC')
  switch (norm.type) {
    case 'Sequence': {
      const steps = (norm.normalizers ?? []).map((item) => compileNormalizer(item))
      return (text) => steps.reduce((acc, fn) => fn(acc), text)
    }
    case 'NFKC':
      return (text) => text.normalize('NFKC')
    case 'NFC':
      return (text) => text.normalize('NFC')
    case 'NFD':
      return (text) => text.normalize('NFD')
    case 'NFKD':
      return (text) => text.normalize('NFKD')
    case 'Lowercase':
      return (text) => text.toLowerCase()
    case 'Strip':
      return (text) => text.trim()
    case 'Replace': {
      const replacement = norm.content ?? ''
      if (norm.pattern?.String !== undefined) {
        const target = norm.pattern.String
        return (text) => text.split(target).join(replacement)
      }
      if (norm.pattern?.Regex !== undefined) {
        const re = new RegExp(norm.pattern.Regex, 'gu')
        return (text) => text.replace(re, replacement)
      }
      return (text) => text
    }
    default:
      return (text) => text
  }
}

interface PreMode {
  marker: string
  byteLevel: boolean
}

function detectPreMode(pre?: HfPreTokenizer | null, hasMetaspace = false, hasGptSpace = false): PreMode {
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
  if (meta) return { marker: meta.replacement ?? METASPACE, byteLevel: false }
  const byteLevel = flat.find((p) => p.type === 'ByteLevel')
  if (byteLevel) return { marker: GPT_SPACE, byteLevel: true }
  if (hasMetaspace) return { marker: METASPACE, byteLevel: false }
  if (hasGptSpace) return { marker: GPT_SPACE, byteLevel: true }
  return { marker: '', byteLevel: false }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Split on both whitespace and any marker already injected by a Replace normalizer (such as Gemma 3 replacing " " with "▁"),
// then attach the marker uniformly to every word so a single-word query produces the same token as a mid-sentence word.
function splitChunks(text: string, mode: PreMode): string[] {
  const splitter = mode.marker && !mode.byteLevel
    ? new RegExp(`[\\s${escapeRegex(mode.marker)}]+`, 'u')
    : /\s+/u
  const words = text.split(splitter).filter(Boolean)
  if (words.length === 0) return []
  if (!mode.marker) return words
  // For ByteLevel, prepend a raw space before UTF-8 byte-to-unicode encoding so every word starts with Ġ uniformly.
  return mode.byteLevel ? words.map((word) => ` ${word}`) : words.map((word) => `${mode.marker}${word}`)
}

function cleanPieces(pieces: string[], specials: Set<string>, mode: PreMode): string[] {
  const out: string[] = []
  for (const raw of pieces) {
    if (specials.has(raw)) continue
    let token = mode.byteLevel ? decodeByteLevel(raw) : raw
    if (mode.marker && !mode.byteLevel && token.startsWith(mode.marker)) token = token.slice(mode.marker.length)
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
  const normalize = compileNormalizer(json.normalizer)
  const mode = detectPreMode(json.pre_tokenizer, hasMetaspace, hasGptSpace)
  const cache = new Map<string, string[]>()

  const segmentChunk = (chunk: string): string[] => {
    const hit = cache.get(chunk)
    if (hit) return hit
    const chars = mode.byteLevel ? encodeByteLevel(chunk) : [...chunk]
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
    const cleaned = cleanPieces(pieces, specials, mode)
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(chunk, cleaned)
    return cleaned
  }

  return (text: string) => {
    const normalized = normalize(text)
    const chunks = splitChunks(normalized, mode)
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
  const normalize = compileNormalizer(json.normalizer)
  const mode = detectPreMode(json.pre_tokenizer, hasMetaspace, hasGptSpace)
  const cache = new Map<string, string[]>()

  const encodeChunk = (chunk: string): string[] => {
    const hit = cache.get(chunk)
    if (hit) return hit
    let symbols = mode.byteLevel ? encodeByteLevel(chunk) : [...chunk]
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
    const cleaned = cleanPieces(symbols, specials, mode)
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(chunk, cleaned)
    return cleaned
  }

  return (text: string) => {
    const normalized = normalize(text)
    const chunks = splitChunks(normalized, mode)
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
