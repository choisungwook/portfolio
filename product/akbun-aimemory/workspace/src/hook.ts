import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Config } from './config.ts'
import { spawnBackgroundIndex } from './indexer/index.ts'
import { addMemory, endSession, openStore, recent, search, type Kind, type Memory, type MemoryInput, type Store } from './store.ts'

// Hook payloads differ per agent (Claude Code, Codex, Kiro, Antigravity), but all send JSON on stdin with a session id,
// a working directory and an event name. Unknown agents fall back to the same field guesses.
export interface HookPayload {
  session_id?: string; sessionId?: string; conversation_id?: string
  cwd?: string; hook_event_name?: string; event?: string
  prompt?: string; message?: string; last_assistant_message?: string
  tool_name?: string; tool_input?: unknown; tool_response?: unknown
}

export type HookEvent = 'start' | 'prompt' | 'tool' | 'stop' | 'end' | 'other'
const TOOL_LIMIT = 2000

export function normalizeEvent(name = ''): HookEvent {
  const n = name.toLowerCase().replace(/[^a-z]/g, '')
  if (n === 'sessionstart' || n === 'agentspawn') return 'start'
  if (n.includes('prompt')) return 'prompt'
  if (n === 'posttooluse' || n === 'aftertool') return 'tool'
  if (n === 'stop' || n === 'subagentstop') return 'stop'
  if (n === 'sessionend') return 'end'
  return 'other'
}

export function toMemory(agent: string, p: HookPayload): MemoryInput | null {
  const session_id = p.session_id ?? p.sessionId ?? p.conversation_id ?? 'unknown'
  const project = p.cwd ? basename(p.cwd) : ''
  const base = { session_id, agent, project }
  const kindContent = ((): [Kind, string] | null => {
    switch (normalizeEvent(p.hook_event_name ?? p.event)) {
      case 'prompt': return p.prompt ?? p.message ? ['prompt', p.prompt ?? p.message!] : null
      case 'tool': return p.tool_name ? ['tool', `${p.tool_name}: ${JSON.stringify(p.tool_input ?? {})}\n${JSON.stringify(p.tool_response ?? '')}`.slice(0, TOOL_LIMIT)] : null
      case 'stop': return p.last_assistant_message ? ['response', p.last_assistant_message] : null
      default: return null
    }
  })()
  return kindContent ? { ...base, kind: kindContent[0], content: kindContent[1] } : null
}

const RAW_KINDS = new Set<Kind>(['prompt', 'tool', 'response'])

function projectSummaries(s: Store, project: string, limit: number): Memory[] {
  const now = Date.now()
  const clauses = ["kind = 'summary'", '(valid_until IS NULL OR valid_until > ?)']
  const params: (string | number)[] = [now]
  if (project) { clauses.push('project = ?'); params.push(project) }
  return s.db.prepare(
    `SELECT id, session_id, agent, project, kind, content, created_at, access_count, last_accessed, valid_until
     FROM memories WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
  ).all(...params, limit) as unknown as Memory[]
}

// Context printed on session start: summaries first for sessions that have one (replacing noisy raw observations),
// then recent memories of unsummarized sessions. Hooks put stdout into the agent context.
export function contextText(s: Store, project: string, query?: string): string {
  const limit = s.config.contextLimit
  const summaries = projectSummaries(s, project, Math.max(limit * 4, 32))
  const summarizedSessions = new Set(summaries.map((m) => m.session_id))
  const summaryBySession = new Map<string, Memory>()
  for (const m of summaries) if (!summaryBySession.has(m.session_id)) summaryBySession.set(m.session_id, m)

  let items: Memory[]
  if (query) {
    const rawHits = search(s, query, { project, limit: limit * 3 })
    const out: Memory[] = []
    const seen = new Set<number>()
    for (const h of rawHits) {
      const chosen = RAW_KINDS.has(h.kind) && summaryBySession.has(h.session_id)
        ? summaryBySession.get(h.session_id)
        : h
      if (!chosen || seen.has(chosen.id)) continue
      seen.add(chosen.id)
      out.push(chosen)
      if (out.length >= limit) break
    }
    items = out
  } else {
    const out: Memory[] = []
    const seen = new Set<number>()
    for (const m of summaries) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
      if (out.length >= limit) break
    }
    if (out.length < limit) {
      for (const m of recent(s, { project, limit: limit * 6 })) {
        if (seen.has(m.id)) continue
        if (RAW_KINDS.has(m.kind) && summarizedSessions.has(m.session_id)) continue
        seen.add(m.id)
        out.push(m)
        if (out.length >= limit) break
      }
    }
    items = out
  }

  if (items.length === 0) return ''
  const lines = items.map((m) => `- [${new Date(m.created_at).toISOString().slice(0, 16)} ${m.kind}] ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`)
  return `# Memory from earlier sessions (${project || 'all projects'})\n\n${lines.join('\n')}\n\nSearch more with: aimem search "<words>" --project ${JSON.stringify(project)}\n`
}

// Fallback: when the database cannot be opened or written, the payload is appended to spool.jsonl and the hook still
// exits 0, so a broken memory store never blocks the agent. The next successful run drains the spool.
export const spoolPath = (config: Config) => join(config.home, 'spool.jsonl')

export function spool(config: Config, agent: string, payload: HookPayload, error: unknown): void {
  try {
    mkdirSync(config.home, { recursive: true })
    appendFileSync(spoolPath(config), JSON.stringify({ agent, payload, at: Date.now() }) + '\n')
  } catch { /* nowhere left to write; stderr below is the last resort */ }
  process.stderr.write(`aimem: memory store unavailable, spooled (${error instanceof Error ? error.message : String(error)})\n`)
}

// Claims the spool by renaming it, so two hooks never replay the same lines. A claimed file left by a killed process
// is picked up too. A line that fails to store (busy database, tokenizer error) goes back to the spool.
export function drainSpool(s: Store): number {
  const file = spoolPath(s.config)
  const dir = dirname(file)
  if (existsSync(file)) renameSync(file, `${file}.${process.pid}`)
  const claimed = readdirSync(dir).filter((f) => f.startsWith('spool.jsonl.')).map((f) => join(dir, f))
  let n = 0
  for (const path of claimed) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue
      let entry: { agent: string; payload: HookPayload; at: number }
      try { entry = JSON.parse(line) } catch { continue } // a torn line from a crash
      try {
        const m = toMemory(entry.agent, entry.payload)
        if (m && addMemory(s, { ...m, created_at: entry.at }) !== null) n++
      } catch { appendFileSync(file, line + '\n') }
    }
    rmSync(path)
  }
  return n
}

// Spooled lines matching a query, for `aimem search` when the database is down.
export function searchSpool(config: Config, query: string): { content: string; kind: string; created_at: number }[] {
  const file = spoolPath(config)
  if (!existsSync(file)) return []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    try {
      const { agent, payload, at } = JSON.parse(line)
      const m = toMemory(agent, payload)
      return m && words.some((w) => m.content.toLowerCase().includes(w)) ? [{ content: m.content, kind: m.kind, created_at: at }] : []
    } catch { return [] }
  })
}

// Returns what to print on stdout. Never throws.
export function runHook(config: Config, agent: string, raw: string): string {
  let payload: HookPayload
  try { payload = raw.trim() ? JSON.parse(raw) : {} } catch { process.stderr.write('aimem: hook input is not JSON, ignored\n'); return '' }
  let s: Store | undefined
  let shouldIndexSession: string | undefined
  try {
    s = openStore(config)
    drainSpool(s)
    const event = normalizeEvent(payload.hook_event_name ?? payload.event)
    const id = payload.session_id ?? payload.sessionId ?? payload.conversation_id
    if (event === 'start') return contextText(s, payload.cwd ? basename(payload.cwd) : '')
    if (event === 'end' && id) endSession(s, id)
    const m = toMemory(agent, payload)
    if (m) addMemory(s, m)
    if ((event === 'stop' || event === 'end') && id) shouldIndexSession = id
    return ''
  } catch (error) {
    spool(config, agent, payload, error)
    return ''
  } finally {
    try { s?.db.close() } catch { /* already broken */ }
    if (shouldIndexSession) spawnBackgroundIndex(config, shouldIndexSession)
  }
}
