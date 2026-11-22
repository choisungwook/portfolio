import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Config } from './config.ts'
import { spawnBackgroundIndex } from './indexer/index.ts'
import { addMemory, endSession, openStore, search, type Kind, type Memory, type MemoryInput, type Store } from './store.ts'

// Hook payloads differ per agent:
// - Claude Code / Codex / Kiro: snake_case (`session_id`, `hook_event_name`, `cwd`, `prompt`, `tool_name`, `tool_input`, `tool_response`, `last_assistant_message`).
// - Antigravity: camelCase (`conversationId`, `hookEventName`, `cwd`/`workspacePaths`, `lastUserInput`, `toolCall: { id, name, args }`, `error`).
export interface HookPayload {
  session_id?: string
  sessionId?: string
  conversation_id?: string
  conversationId?: string
  cwd?: string
  workspacePaths?: string[]
  hook_event_name?: string
  hookEventName?: string
  event?: string
  prompt?: string
  message?: string
  lastUserInput?: string
  last_assistant_message?: string
  tool_name?: string
  tool_input?: unknown
  tool_response?: unknown
  toolCall?: { id?: string; name?: string; args?: unknown }
  error?: string
  turn_id?: string
  tool_use_id?: string
  model?: string
  modelName?: string
  transcript_path?: string | null
  transcriptPath?: string
  terminationReason?: string
}

export type HookEvent = 'start' | 'prompt' | 'tool' | 'stop' | 'end' | 'other'
const TOOL_LIMIT = 2000

export function normalizeEvent(name = ''): HookEvent {
  const n = name.toLowerCase().replace(/[^a-z]/g, '')
  if (n === 'sessionstart' || n === 'agentspawn') return 'start'
  if (n.includes('prompt') || n === 'preinvocation') return 'prompt'
  if (n === 'posttooluse' || n === 'aftertool') return 'tool'
  if (n === 'stop' || n === 'subagentstop') return 'stop'
  if (n === 'sessionend') return 'end'
  return 'other'
}

export function extractSessionId(p: HookPayload): string | undefined {
  return p.session_id ?? p.sessionId ?? p.conversation_id ?? p.conversationId
}

export function extractCwd(p: HookPayload): string | undefined {
  return p.cwd ?? p.workspacePaths?.[0]
}

export function extractEventName(p: HookPayload): string | undefined {
  return p.hook_event_name ?? p.hookEventName ?? p.event
}

export function toMemory(agent: string, p: HookPayload): MemoryInput | null {
  const session_id = extractSessionId(p) ?? 'unknown'
  const cwd = extractCwd(p)
  const project = cwd ? basename(cwd) : ''
  const base = { session_id, agent, project }
  const kindContent = ((): [Kind, string] | null => {
    switch (normalizeEvent(extractEventName(p))) {
      case 'prompt': {
        const text = p.prompt ?? p.message ?? p.lastUserInput
        return text ? ['prompt', text] : null
      }
      case 'tool': {
        const toolName = p.tool_name ?? p.toolCall?.name
        if (!toolName) return null
        const toolInput = p.tool_input ?? p.toolCall?.args ?? {}
        const toolResponse = p.tool_response !== undefined
          ? p.tool_response
          : (p.error ? { error: p.error } : '')
        const responseStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse)
        return ['tool', `${toolName}: ${JSON.stringify(toolInput)}\n${responseStr}`.slice(0, TOOL_LIMIT)]
      }
      case 'stop':
        return p.last_assistant_message ? ['response', p.last_assistant_message] : null
      default:
        return null
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

// Context printed on session start: sessions that have a summary emit that summary instead of noisy raw observations,
// while notes and unsummarized sessions stay visible in recency order. Hooks put stdout into the agent context.
export function contextText(s: Store, project: string, query?: string): string {
  const limit = s.config.contextLimit
  const now = Date.now()

  let items: Memory[]
  if (query) {
    const summaries = projectSummaries(s, project, Math.max(limit * 4, 32))
    const summaryBySession = new Map<string, Memory>()
    for (const m of summaries) if (!summaryBySession.has(m.session_id)) summaryBySession.set(m.session_id, m)
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
    // Filter raw observations of summarized sessions in SQL so large summarized sessions cannot crowd out notes or newer sessions.
    const clauses = ['(m.valid_until IS NULL OR m.valid_until > ?)']
    const params: (string | number)[] = [now]
    if (project) { clauses.push('m.project = ?'); params.push(project) }
    clauses.push(`NOT (
      m.kind IN ('prompt', 'tool', 'response')
      AND EXISTS (
        SELECT 1 FROM memories s
        WHERE s.session_id = m.session_id
          AND s.kind = 'summary'
          AND (s.valid_until IS NULL OR s.valid_until > ?)
      )
    )`)
    params.push(now)
    const rows = s.db.prepare(
      `SELECT m.id, m.session_id, m.agent, m.project, m.kind, m.content, m.created_at, m.access_count, m.last_accessed, m.valid_until
       FROM memories m WHERE ${clauses.join(' AND ')} ORDER BY m.created_at DESC LIMIT ?`,
    ).all(...params, limit * 3) as unknown as Memory[]

    const out: Memory[] = []
    const seenSummarySession = new Set<string>()
    for (const m of rows) {
      if (m.kind === 'summary') {
        if (seenSummarySession.has(m.session_id)) continue
        seenSummarySession.add(m.session_id)
      }
      out.push(m)
      if (out.length >= limit) break
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
    appendFileSync(spoolPath(config), `${JSON.stringify({ agent, payload, at: Date.now() })}\n`)
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
      } catch { appendFileSync(file, `${line}\n`) }
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

function formatHookOutput(agent: string, event: HookEvent, ctx: string): string {
  if (agent === 'antigravity') {
    if (event === 'start' && ctx) {
      return `${JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: ctx } }] })}\n`
    }
    return '{}\n'
  }
  return event === 'start' ? ctx : ''
}

// Returns what to print on stdout. Never throws.
export function runHook(config: Config, agent: string, raw: string): string {
  let payload: HookPayload
  try { payload = raw.trim() ? JSON.parse(raw) : {} } catch {
    process.stderr.write('aimem: hook input is not JSON, ignored\n')
    return agent === 'antigravity' ? '{}\n' : ''
  }
  let s: Store | undefined
  let shouldIndexSession: string | undefined
  try {
    s = openStore(config)
    drainSpool(s)
    const event = normalizeEvent(extractEventName(payload))
    const id = extractSessionId(payload)
    if (event === 'start') {
      const cwd = extractCwd(payload)
      return formatHookOutput(agent, event, contextText(s, cwd ? basename(cwd) : ''))
    }
    if (event === 'end' && id) endSession(s, id)
    const m = toMemory(agent, payload)
    if (m) addMemory(s, m)
    if ((event === 'stop' || event === 'end') && id) shouldIndexSession = id
    return formatHookOutput(agent, event, '')
  } catch (error) {
    spool(config, agent, payload, error)
    return agent === 'antigravity' ? '{}\n' : ''
  } finally {
    try { s?.db.close() } catch { /* already broken */ }
    if (shouldIndexSession) spawnBackgroundIndex(config, shouldIndexSession)
  }
}
