import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { loadConfig } from './config.ts'
import { contextText, runHook, searchSpool } from './hook.ts'
import { addMemory, deleteMemory, deleteSession, exportDb, importDb, invalidateMemory, listSessions, openStore, recent, reindex, search, sessionMemories } from './store.ts'
import { serve } from './server.ts'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

const HELP = `aimem ${VERSION} - local memory for AI coding agents (Claude Code, Codex, Kiro, Antigravity)

Usage: aimem <command> [options]

Hook (wire these into the agent's hook config; they read the hook JSON on stdin and always exit 0):
  aimem hook --agent <claude|codex|kiro|antigravity>
      SessionStart prints earlier memories of this project to stdout (the agent adds it to context).
      UserPromptSubmit, PostToolUse and Stop store the prompt, the tool call and the last reply.
      If the database is unavailable the event is spooled to $AIMEMORY_HOME/spool.jsonl and replayed later.

Read:
  aimem search <query> [--project P] [--limit N] [--all] [--json]   hybrid keyword + vector search, recent first on ties
  aimem context [--project P] [--query Q]                           the text SessionStart would print
  aimem recent [--project P] [--limit N] [--all] [--json]
  aimem sessions [--json]                                           sessions with memory counts
  aimem show <session-id> [--json]                                  every memory of one session

Write:
  aimem add <text> [--project P] [--session S] [--agent A]          store a note by hand
  aimem invalidate <memory-id>                                      mark a superseded memory invalid without deleting it
  aimem delete <memory-id> | aimem delete --session <id>

Maintenance:
  aimem export <file.db>      consistent SQLite copy (backup)
  aimem import <file.db>      merge a backup; duplicates are skipped
  aimem reindex               rebuild token index and vectors after changing the tokenizer
  aimem serve [--port N]      web UI on 127.0.0.1 (prints a URL with a token)
  aimem config                print the effective config as JSON

Environment: AIMEMORY_HOME (default ~/.aimemory). Config: $AIMEMORY_HOME/aimemory.config.json
Exit codes: 0 ok, 1 error, 2 bad usage. --json prints machine-readable output on stdout.
Example (Claude Code settings.json): {"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"aimem hook --agent claude"}]}]}}
`

// Hooks must exit 0 whatever happens, so they skip strict argument parsing, and a broken config falls back to the
// default home, where the event is spooled.
if (process.argv[2] === 'hook') {
  const i = process.argv.indexOf('--agent')
  const agent = (i > 0 && process.argv[i + 1]) || 'unknown'
  let raw = ''
  try { raw = readFileSync(0, 'utf8') } catch { /* no stdin */ }
  let cfg
  try { cfg = loadConfig() } catch (error) {
    process.stderr.write(`aimem: config unreadable (${error instanceof Error ? error.message : error}), using defaults\n`)
    cfg = loadConfig(undefined, false)
  }
  process.stdout.write(runHook(cfg, agent, raw))
  process.exit(0)
}

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: 'string', default: 'manual' }, project: { type: 'string' }, session: { type: 'string' },
    limit: { type: 'string' }, query: { type: 'string' }, port: { type: 'string', default: '7788' },
    all: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false },
  },
})
const [cmd, ...rest] = positionals
const config = loadConfig()
const limit = o.limit ? Number(o.limit) : undefined
const out = (data: unknown, text: () => string) => process.stdout.write(o.json ? JSON.stringify(data, null, 2) + '\n' : text())
const line = (m: { id?: number; created_at: number; kind: string; content: string }) =>
  `${m.id ?? '-'}\t${new Date(m.created_at).toISOString().slice(0, 16)}\t${m.kind}\t${m.content.replace(/\s+/g, ' ').slice(0, 160)}\n`
const usage = (msg: string) => { process.stderr.write(`aimem: ${msg}\n\n${HELP}`); process.exit(2) }

if (o.help || !cmd || cmd === 'help') { process.stdout.write(HELP); process.exit(0) }
if (cmd === 'version' || cmd === '--version') { console.log(VERSION); process.exit(0) }

if (cmd === 'config') { console.log(JSON.stringify(config, null, 2)); process.exit(0) }

if (cmd === 'search' && rest.length) {
  try {
    const s = openStore(config)
    const hits = search(s, rest.join(' '), { project: o.project, limit, includeInvalid: o.all })
    out({ degraded: false, hits }, () => hits.map(line).join('') || 'no match\n')
  } catch (error) {
    // Fallback: plain substring search over the spool, so an agent still gets something.
    const hits = searchSpool(config, rest.join(' '))
    process.stderr.write(`aimem: database unavailable (${error instanceof Error ? error.message : error}); searched the spool only\n`)
    out({ degraded: true, hits }, () => hits.map(line).join('') || 'no match\n')
  }
  process.exit(0)
}

const commands: Record<string, () => void | Promise<void>> = {
  context: () => { process.stdout.write(contextText(openStore(config), o.project ?? basename(process.cwd()), o.query)) },
  recent: () => { const r = recent(openStore(config), { project: o.project, limit, includeInvalid: o.all }); out(r, () => r.map(line).join('')) },
  sessions: () => {
    const r = listSessions(openStore(config)) as { id: string; agent: string; project: string; memories: number; started_at: number }[]
    out(r, () => r.map((x) => `${x.id}\t${x.agent}\t${x.project}\t${x.memories}\t${new Date(x.started_at).toISOString().slice(0, 16)}\n`).join(''))
  },
  show: () => { if (!rest[0]) usage('show needs a session id'); const r = sessionMemories(openStore(config), rest[0]); out(r, () => r.map(line).join('')) },
  add: () => {
    if (!rest.length) usage('add needs text')
    const id = addMemory(openStore(config), { session_id: o.session ?? 'manual', agent: o.agent!, project: o.project ?? basename(process.cwd()), kind: 'note', content: rest.join(' ') })
    out({ id }, () => id === null ? 'already stored\n' : `${id}\n`)
  },
  invalidate: () => {
    if (!rest[0]) usage('invalidate needs a memory id')
    out({ invalidated: invalidateMemory(openStore(config), Number(rest[0])) }, () => 'invalidated\n')
  },
  delete: () => {
    const s = openStore(config)
    if (o.session) out({ deleted: deleteSession(s, o.session) }, () => 'deleted\n')
    else if (rest[0]) out({ deleted: deleteMemory(s, Number(rest[0])) }, () => 'deleted\n')
    else usage('delete needs a memory id or --session')
  },
  export: () => { if (!rest[0]) usage('export needs a file'); exportDb(openStore(config), rest[0]); out({ file: rest[0] }, () => `${rest[0]}\n`) },
  import: () => { if (!rest[0]) usage('import needs a file'); const r = importDb(openStore(config), rest[0]); out(r, () => `added ${r.added}, skipped ${r.skipped}\n`) },
  reindex: () => { const n = reindex(openStore(config)); out({ reindexed: n }, () => `reindexed ${n}\n`) },
  serve: async () => { console.log(await serve(openStore(config), Number(o.port))) },
}

const run = commands[cmd]
if (!run) usage(`unknown command ${cmd}`)
try { await run() } catch (error) {
  process.stderr.write(`aimem: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
