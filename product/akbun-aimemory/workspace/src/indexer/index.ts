import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import type { Config } from '../config.ts'
import { addMemory, invalidateMemory, recent, search, sessionMemories, type Kind, type Memory, type Store } from '../store.ts'
import { defaultModelCaller, type ModelCaller } from './providers.ts'

export type IndexerAction =
  | { op: 'ADD'; content: string }
  | { op: 'UPDATE'; target_id: number; content: string }
  | { op: 'NOOP'; reason?: string }

export interface IndexerOutput {
  summary: string
  actions: IndexerAction[]
}

export interface IndexSessionResult {
  skipped?: boolean
  summaryId: number | null
  added: number
  updated: number
  noop: number
  error?: string
}

const MAX_OBSERVATION_CHARS = 8000
const MAX_CANDIDATES = 20
const RAW_OBSERVATION_KINDS = new Set<Kind>(['prompt', 'tool', 'response'])

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  try {
    const direct = JSON.parse(trimmed) as unknown
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>
  } catch { /* try stripping outer code fence or extracting outermost JSON object */ }
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = unfenced.indexOf('{')
  const lastBrace = unfenced.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('indexer output did not contain a JSON object')
  const parsed = JSON.parse(unfenced.slice(firstBrace, lastBrace + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('indexer output must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

export function parseIndexerOutput(raw: string): IndexerOutput {
  const parsed = parseJsonObject(raw)
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const actions: IndexerAction[] = []
  if (Array.isArray(parsed.actions)) {
    for (const item of parsed.actions) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const op = typeof rec.op === 'string' ? rec.op.toUpperCase() : ''
      if (op === 'ADD' && typeof rec.content === 'string' && rec.content.trim()) {
        actions.push({ op: 'ADD', content: rec.content.trim() })
      } else if (op === 'UPDATE' && typeof rec.target_id === 'number' && Number.isInteger(rec.target_id) && typeof rec.content === 'string' && rec.content.trim()) {
        actions.push({ op: 'UPDATE', target_id: rec.target_id, content: rec.content.trim() })
      } else if (op === 'NOOP') {
        actions.push({ op: 'NOOP', reason: typeof rec.reason === 'string' ? rec.reason : undefined })
      }
    }
  }
  return { summary, actions }
}

function buildPrompt(observations: Memory[], existing: Memory[]): string {
  const obsLines: string[] = []
  let used = 0
  for (const m of observations) {
    const entry = `[${m.kind}] ${m.content.replace(/\s+/g, ' ').slice(0, 600)}`
    if (used + entry.length > MAX_OBSERVATION_CHARS) break
    obsLines.push(entry)
    used += entry.length
  }
  const existingLines = existing.map((m) => `- id=${m.id} (${m.kind}): ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`)
  return [
    '## Session Observations',
    obsLines.join('\n'),
    '',
    '## Existing Project Memories',
    existingLines.length ? existingLines.join('\n') : '(none)',
  ].join('\n')
}

// Prioritize semantic/lexical search hits first so relevant older facts are never crowded out by recent items.
function gatherExisting(s: Store, sessionId: string, project: string, observations: Memory[]): Memory[] {
  const seen = new Map<number, Memory>()
  const seedQuery = observations
    .filter((m) => m.kind === 'prompt' || m.kind === 'response')
    .slice(-3)
    .map((m) => m.content.slice(0, 120))
    .join(' ')
  if (seedQuery.trim()) {
    for (const h of search(s, seedQuery, { project: project || undefined, limit: MAX_CANDIDATES, recordAccess: false })) {
      if (h.session_id !== sessionId && !seen.has(h.id)) seen.set(h.id, h)
      if (seen.size >= MAX_CANDIDATES) break
    }
  }
  if (seen.size < MAX_CANDIDATES) {
    for (const m of recent(s, { project: project || undefined, limit: MAX_CANDIDATES })) {
      if (m.session_id !== sessionId && !seen.has(m.id)) seen.set(m.id, m)
      if (seen.size >= MAX_CANDIDATES) break
    }
  }
  return [...seen.values()]
}

export async function indexSession(
  s: Store,
  sessionId: string,
  opts: { callModel?: ModelCaller; force?: boolean } = {},
): Promise<IndexSessionResult> {
  if (s.config.indexer.provider === 'none') {
    return { skipped: true, summaryId: null, added: 0, updated: 0, noop: 0 }
  }
  const allRows = sessionMemories(s, sessionId)
  // Only raw observations feed the summarizer and fingerprint; indexer-created notes and summaries must not re-trigger it.
  const observations = allRows.filter((m) => RAW_OBSERVATION_KINDS.has(m.kind))
  if (observations.length === 0) {
    return { skipped: true, summaryId: null, added: 0, updated: 0, noop: 0 }
  }

  const fingerprint = createHash('sha256').update(observations.map((m) => m.id).join(',')).digest('hex').slice(0, 16)
  const metaKey = `indexed_session:${sessionId}`
  if (!opts.force) {
    const prev = s.db.prepare('SELECT value FROM meta WHERE key = ?').get(metaKey) as { value: string } | undefined
    if (prev?.value === fingerprint) {
      return { skipped: true, summaryId: null, added: 0, updated: 0, noop: 0 }
    }
  }

  const agent = observations[0].agent
  const project = observations[0].project
  const existing = gatherExisting(s, sessionId, project, observations)
  const allowedTargets = new Set(existing.map((m) => m.id))
  const prompt = buildPrompt(observations, existing)
  const caller = opts.callModel ?? defaultModelCaller

  let output: IndexerOutput
  try {
    const raw = await caller(prompt, s.config.indexer)
    output = parseIndexerOutput(raw)
  } catch (error) {
    return {
      summaryId: null,
      added: 0,
      updated: 0,
      noop: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  let summaryId: number | null = null
  let added = 0
  let updated = 0
  let noop = 0

  // Commit summary and actions inside BEGIN IMMEDIATE so overlapping Stop/SessionEnd workers cannot leave duplicate valid summaries.
  s.db.exec('BEGIN IMMEDIATE')
  try {
    if (!opts.force) {
      const prev = s.db.prepare('SELECT value FROM meta WHERE key = ?').get(metaKey) as { value: string } | undefined
      if (prev?.value === fingerprint) {
        s.db.exec('COMMIT')
        return { skipped: true, summaryId: null, added: 0, updated: 0, noop: 0 }
      }
    }

    if (output.summary) {
      const now = Date.now()
      const currentSummaries = sessionMemories(s, sessionId).filter((m) => m.kind === 'summary')
      const exactExisting = currentSummaries.find((m) => m.content === output.summary)
      for (const old of currentSummaries) {
        if (exactExisting && old.id === exactExisting.id) continue
        if (old.valid_until === null) invalidateMemory(s, old.id, now)
      }
      if (exactExisting) {
        // Keep or re-activate the existing identical summary rather than colliding on unique digest.
        if (exactExisting.valid_until !== null) {
          s.db.prepare('UPDATE memories SET valid_until = NULL, created_at = ? WHERE id = ?').run(now, exactExisting.id)
        }
        summaryId = exactExisting.id
      } else {
        summaryId = addMemory(s, {
          session_id: sessionId,
          agent,
          project,
          kind: 'summary',
          content: output.summary,
        })
      }
    }

    for (const action of output.actions) {
      if (action.op === 'ADD') {
        if (addMemory(s, { session_id: sessionId, agent, project, kind: 'note', content: action.content }) !== null) added++
      } else if (action.op === 'UPDATE') {
        if (!allowedTargets.has(action.target_id)) continue
        const inserted = addMemory(s, { session_id: sessionId, agent, project, kind: 'note', content: action.content })
        if (inserted !== null) {
          invalidateMemory(s, action.target_id)
          allowedTargets.delete(action.target_id)
          updated++
        }
      } else if (action.op === 'NOOP') {
        noop++
      }
    }

    s.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(metaKey, fingerprint)
    s.db.exec('COMMIT')
  } catch (error) {
    s.db.exec('ROLLBACK')
    throw error
  }

  return { summaryId, added, updated, noop }
}

function resolveSelfCommand(): { command: string; args: string[] } {
  const runtime = basename(process.execPath).replace(/\.exe$/, '')
  if (runtime === 'node' || runtime === 'bun') {
    const cliEntry = join(import.meta.dirname, '..', 'cli.ts')
    return { command: process.execPath, args: [cliEntry] }
  }
  return { command: process.execPath, args: [] }
}

function hasProviderCredentials(config: Config): boolean {
  if (config.indexer.provider === 'claude') return Boolean(process.env.ANTHROPIC_API_KEY)
  if (config.indexer.provider === 'openai') return Boolean(process.env.OPENAI_API_KEY)
  return false
}

// Launch `aimem index <sessionId>` detached so the hook never waits for the LLM call.
export function spawnBackgroundIndex(config: Config, sessionId: string): void {
  if (config.indexer.provider === 'none' || !sessionId || process.env.AIMEMORY_NO_INDEXER === '1') return
  if (!hasProviderCredentials(config)) return
  try {
    const { command, args } = resolveSelfCommand()
    const child = spawn(command, [...args, 'index', sessionId], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, AIMEMORY_HOME: config.home },
    })
    child.unref()
  } catch { /* never let background spawn interfere with the hook */ }
}
