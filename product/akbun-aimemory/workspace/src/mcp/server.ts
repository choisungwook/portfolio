import { basename } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Config } from '../config.ts'
import { searchSpool } from '../hook.ts'
import { addMemory, openStore, recent, search, sessionMemories, type Store } from '../store.ts'

// Tool descriptions intentionally mirror `aimem --help` and `skills/aimemory/SKILL.md`.
// Delete is intentionally excluded: only humans delete memories via CLI or UI.
export const MCP_TOOLS: Tool[] = [
  {
    name: 'search',
    description: 'Hybrid keyword + vector search across earlier sessions, recent first on ties. Returns { degraded, hits } matching `aimem search --json`; degraded: true means the database was unavailable and only the spool was searched.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search words in Korean, English, Japanese, or Chinese.' },
        project: { type: 'string', description: 'Optional project name filter (basename of cwd).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum hits to return.' },
        all: { type: 'boolean', description: 'Include invalidated memories.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'recent',
    description: 'List the latest memories when you have no query yet. Matches `aimem recent --json`.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project name filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum memories to return.' },
        all: { type: 'boolean', description: 'Include invalidated memories.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'show_session',
    description: 'Print every memory of one earlier session when one hit is not enough. Matches `aimem show <session-id> --json`.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Session identifier.' },
      },
      required: ['session_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_note',
    description: 'Store a durable note (decisions, conventions, and reasons) by hand. Matches `aimem add --json`.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Note content to store.' },
        project: { type: 'string', description: 'Optional project name (defaults to basename of cwd).' },
        session: { type: 'string', description: 'Optional session id (defaults to "manual").' },
        agent: { type: 'string', description: 'Optional agent label (defaults to "mcp").' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
  },
]

function objectResult(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }
}

function arrayResult(value: unknown[]): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw new TypeError(`${key} must be a string`)
  return v
}

function optionalLimit(args: Record<string, unknown>): number | undefined {
  const v = args.limit
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100) {
    throw new TypeError('limit must be an integer between 1 and 100')
  }
  return v
}

function optionalBool(args: Record<string, unknown>, key: string): boolean {
  const v = args[key]
  if (v === undefined) return false
  if (typeof v !== 'boolean') throw new TypeError(`${key} must be a boolean`)
  return v
}

function rejectUnknownKeys(args: Record<string, unknown>, allowed: string[]): void {
  const allowSet = new Set(allowed)
  for (const key of Object.keys(args)) {
    if (!allowSet.has(key)) throw new TypeError(`unknown argument: ${key}`)
  }
}

function withStore<T>(config: Config, fn: (s: Store) => T): T {
  const s = openStore(config)
  try {
    return fn(s)
  } finally {
    s.db.close()
  }
}

export function callMcpTool(config: Config, name: string, rawArgs: Record<string, unknown> = {}): CallToolResult {
  try {
    if (name === 'search') {
      rejectUnknownKeys(rawArgs, ['query', 'project', 'limit', 'all'])
      const query = optionalString(rawArgs, 'query')?.trim()
      if (!query) return errorResult('query must be a non-empty string')
      const project = optionalString(rawArgs, 'project')
      const limit = optionalLimit(rawArgs)
      const includeInvalid = optionalBool(rawArgs, 'all')
      try {
        const hits = withStore(config, (s) => search(s, query, { project, limit, includeInvalid }))
        return objectResult({ degraded: false, hits })
      } catch {
        // Degrade gracefully to spool substring search, matching `aimem search --json`.
        const hits = searchSpool(config, query)
        return objectResult({ degraded: true, hits })
      }
    }

    if (name === 'recent') {
      rejectUnknownKeys(rawArgs, ['project', 'limit', 'all'])
      const project = optionalString(rawArgs, 'project')
      const limit = optionalLimit(rawArgs)
      const includeInvalid = optionalBool(rawArgs, 'all')
      return arrayResult(withStore(config, (s) => recent(s, { project, limit, includeInvalid })))
    }

    if (name === 'show_session') {
      rejectUnknownKeys(rawArgs, ['session_id'])
      const sessionId = optionalString(rawArgs, 'session_id')?.trim()
      if (!sessionId) return errorResult('session_id must be a non-empty string')
      return arrayResult(withStore(config, (s) => sessionMemories(s, sessionId)))
    }

    if (name === 'add_note') {
      rejectUnknownKeys(rawArgs, ['text', 'project', 'session', 'agent'])
      const text = optionalString(rawArgs, 'text')?.trim()
      if (!text) return errorResult('text must be a non-empty string')
      const project = optionalString(rawArgs, 'project')?.trim() || basename(process.cwd())
      const session = optionalString(rawArgs, 'session')?.trim() || 'manual'
      const agent = optionalString(rawArgs, 'agent')?.trim() || 'mcp'
      const id = withStore(config, (s) => addMemory(s, { session_id: session, agent, project, kind: 'note', content: text }))
      return objectResult({ id })
    }

    return errorResult(`unknown tool: ${name}`)
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error))
  }
}

export function createMcpServer(config: Config, version: string): Server {
  const server = new Server({ name: 'akbun-aimemory', version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: MCP_TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, ({ params }) =>
    callMcpTool(config, params.name, (params.arguments ?? {}) as Record<string, unknown>),
  )
  return server
}

export async function serveMcp(config: Config, version: string): Promise<void> {
  const server = createMcpServer(config, version)
  const closed = new Promise<void>((resolve) => { server.onclose = resolve })
  await server.connect(new StdioServerTransport())
  const onEnd = () => { void server.close() }
  process.stdin.once('end', onEnd)
  try {
    await closed
  } finally {
    process.stdin.off('end', onEnd)
  }
}
