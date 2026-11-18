import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Db } from '../db/open.ts'
import { handoffMode, listHandoffs } from '../db/handoffs.ts'

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

export async function serveMcp(db: Db, version: string): Promise<void> {
  const server = new Server({ name: 'akbun-taskq', version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
    const args = params.arguments ?? {}
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
