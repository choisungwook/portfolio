import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import { handoffMode, listHandoffs } from '../db/handoffs.ts'
import { OPERATIONS, pathParams } from '../ops/operations.ts'
import { localApi } from '../ops/local-api.ts'
import { z } from 'zod'
import { basename } from 'node:path'
import { getAgent } from '../db/team.ts'
import { hybridSearch } from '../team/search.ts'
import { teamTools, ToolError } from '../team/tools.ts'

// Every API operation as a tool named taskq_<operation>: tasks, bots, workflows, files, settings and plugins.
// The path parameters are declared; the rest of an operation's fields are listed in its description and passed on.
const OPERATION_TOOLS: Tool[] = OPERATIONS.map((op) => {
  const params = pathParams(op.path)
  return {
    name: `taskq_${op.name}`,
    description: `${op.description} (${op.method} ${op.path})`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(params.map((p) => [p, { type: 'string' }])),
      ...(params.length ? { required: params } : {}),
      additionalProperties: true,
    },
    annotations: { readOnlyHint: op.method === 'GET', destructiveHint: op.method === 'DELETE' || op.name === 'update_install' },
  }
})

const taskId = { type: 'string', pattern: '^[0-9a-f]{8}$' }
const TOOLS: Tool[] = [
  {
    name: 'taskq_list_handoffs',
    description: 'List up to 50 handoff records, pending first. Filter by sender or receiver task ID. Includes acceptance method and timestamps.',
    inputSchema: { type: 'object', properties: { task_id: taskId }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'taskq_handoff_mode',
    description: 'Read whether the task automatically accepts incoming handoffs.',
    inputSchema: { type: 'object', properties: { task_id: taskId }, required: ['task_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
]

function result(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }
}

function error(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

export async function serveMcp(db: Db, config: Config, version: string): Promise<void> {
  const server = new Server({ name: 'akbun-taskq', version }, { capabilities: { tools: {} } })
  const call = localApi(db, config)
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...TOOLS, ...OPERATION_TOOLS] }))
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const args = params.arguments ?? {}
    const operation = OPERATIONS.find((op) => `taskq_${op.name}` === params.name)
    if (operation) {
      const answer = await call(operation, args)
      const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)
      if (answer.status >= 400) return error(`${answer.status}: ${text}`)
      return { content: [{ type: 'text', text }] }
    }
    const id = args.task_id
    if (Object.keys(args).some((key) => key !== 'task_id') ||
      (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f]{8}$/.test(id)))) {
      return error('task_id must be an eight-character lowercase hex ID')
    }
    if (params.name === 'taskq_list_handoffs') return result({ handoffs: listHandoffs(db, id) })
    if (params.name !== 'taskq_handoff_mode') return error('unknown tool')
    if (id === undefined) return error('task_id is required')
    const automatic = handoffMode(db, id)
    return automatic === undefined ? error('task not found') : result({ task_id: id, auto_accept: automatic })
  })
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

// One bot's own tools (messages, tasks, wiki, memory, workflows) as an MCP server, for an agent runtime that runs in its
// own process and takes tools over MCP: Codex (ChatGPT plan) and Kiro. The tools act as that bot, with the same checks
// as in a Claude or OpenAI Agents SDK turn; TASKQ_TURN_ID ties their writes to the running turn so a failed turn that
// already wrote is not retried.
export async function serveBotMcp(db: Db, config: Config, bot: string, version: string): Promise<void> {
  if (!getAgent(db, bot)) throw new Error(`no bot named ${bot}`)
  const turnId = Number(process.env.TASKQ_TURN_ID) || undefined
  const tools = teamTools({ db, config, agent: bot, search: hybridSearch(db), turnId })
  const server = new Server({ name: `taskq-${bot}`, version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => {
      const { $schema: _schema, ...inputSchema } = z.toJSONSchema(z.object(t.input).strict()) as Record<string, unknown>
      return { name: t.name, description: t.description, inputSchema: inputSchema as Tool['inputSchema'], annotations: { readOnlyHint: t.readOnly } }
    }),
  }))
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const found = tools.find((t) => t.name === params.name)
    if (!found) return error('unknown tool')
    try {
      return result(await found.handler(params.arguments ?? {}))
    } catch (failure) {
      if (failure instanceof ToolError) return error(failure.message)
      throw failure
    }
  })
  const closed = new Promise<void>((resolve) => { server.onclose = resolve })
  await server.connect(new StdioServerTransport())
  process.stdin.once('end', () => { void server.close() })
  await closed
}

// How another process starts this taskq: the release binary is one executable; in development node runs the CLI entry.
export function selfCommand(): { command: string; args: string[] } {
  const runtime = basename(process.execPath).replace(/\.exe$/, '')
  if ((runtime === 'node' || runtime === 'bun') && process.argv[1]) return { command: process.execPath, args: [process.argv[1]] }
  return { command: process.execPath, args: [] }
}
