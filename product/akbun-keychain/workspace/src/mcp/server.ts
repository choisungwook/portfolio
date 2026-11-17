import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { agentRequest, agentStatus } from '../agent/client.ts'
import type { RunResult } from '../agent/protocol.ts'
import { KeychainError } from '../core/errors.ts'
import { VERSION } from '../version.ts'

// A thin layer over the agent client. No vault logic and no password: while locked every tool but
// keychain_status answers LOCKED. There is no tool that overwrites, edits or deletes.
export const OUTPUT_LIMIT = 64 * 1024
const DEFAULT_TIMEOUT_SEC = 120

export const TOOLS = [
  {
    name: 'keychain_status',
    description: 'Whether the akbun-keychain vault is unlocked, and until when. Call this first. Works while locked.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_keys',
    description:
      'List the stored keys: name, description, tags, ai_access, updated_at. Call this before run_with_secrets to find ' +
      'the key name. Values are never listed. A deny key shows only its name and ai_access and cannot be used.',
    inputSchema: {
      type: 'object',
      properties: { tag: { type: 'string', description: 'Only keys with this tag.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'run_with_secrets',
    description:
      'Preferred way to use a secret. Runs a command (no shell) with environment variables filled from stored keys, ' +
      'and returns its exit code and output with every secret value replaced by [masked:<key>]. The value never ' +
      'enters your context. Works for inject and reveal keys. For a shell feature, pass ["sh","-c","..."].',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Program and arguments.' },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Map of environment variable name to key name, like {"GH_TOKEN": "github/token"}.',
        },
        cwd: { type: 'string', description: 'Working directory. Defaults to the server\'s.' },
        stdin: { type: 'string', description: 'Text written to the command\'s stdin.' },
        timeout_sec: { type: 'number', description: `Kill the command after this many seconds. Default ${DEFAULT_TIMEOUT_SEC}.` },
      },
      required: ['command', 'env'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_secret',
    description:
      'Return the value of a reveal key as text. Only for values a tool needs as text; prefer run_with_secrets. ' +
      'inject and deny keys are refused.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_secret',
    description:
      'Store a new secret under a new name. It is created as inject (usable through run_with_secrets only). ' +
      'Fails if the name exists; only the user can overwrite, edit or delete.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Lowercase, like service/purpose.' },
        value: { type: 'string' },
        description: { type: 'string', description: 'Plaintext note. Never a secret.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'value'],
      additionalProperties: false,
    },
  },
] as const

function text(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function failure(error: unknown): CallToolResult {
  if (error instanceof KeychainError) {
    const message = error.code === 'LOCKED' ? 'the vault is locked. Ask the user to run `akbun-keychain unlock` in a terminal.' : error.message
    return { isError: true, content: [{ type: 'text', text: `${error.code}: ${message}` }] }
  }
  return { isError: true, content: [{ type: 'text', text: 'UNEXPECTED: internal error in the MCP server' }] }
}

function cut(output: string): string {
  if (Buffer.byteLength(output) <= OUTPUT_LIMIT) return output
  return `${Buffer.from(output).subarray(0, OUTPUT_LIMIT).toString('utf8')}\n[cut at 64 KiB]`
}

function args(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

export async function callTool(name: string, input: Record<string, unknown>): Promise<CallToolResult> {
  try {
    switch (name) {
      case 'keychain_status':
        return text(await agentStatus('mcp'))
      case 'list_keys':
        return text(await agentRequest('list', input.tag === undefined ? {} : { tag: input.tag }, { actor: 'mcp' }))
      case 'get_secret':
        return text(await agentRequest('get', { name: input.name }, { actor: 'mcp' }))
      case 'create_secret':
        return text(await agentRequest('create', input, { actor: 'mcp' }))
      case 'run_with_secrets':
        return text(await runWithSecrets(input))
      default:
        return { isError: true, content: [{ type: 'text', text: `INVALID: unknown tool ${name}` }] }
    }
  } catch (error) {
    return failure(error)
  }
}

async function runWithSecrets(input: Record<string, unknown>): Promise<unknown> {
  let stdout = ''
  let stderr = ''
  const timeoutSec = input.timeout_sec === undefined ? DEFAULT_TIMEOUT_SEC : input.timeout_sec
  if (typeof timeoutSec !== 'number' || !(timeoutSec > 0)) throw new KeychainError('INVALID', 'timeout_sec must be a positive number')
  const base_env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const params = {
    command: input.command,
    env: input.env,
    base_env,
    cwd: input.cwd ?? process.cwd(),
    stdin: input.stdin,
    timeout_ms: timeoutSec * 1000,
  }
  const collect = { actor: 'mcp' as const, onStream: (line: { stream: string; data: string }) => {
    if (line.stream === 'stdout') stdout += line.data
    else stderr += line.data
  } }
  try {
    const result = await agentRequest<RunResult>('run', params, collect)
    return { exit_code: result.exit_code, timed_out: false, stdout: cut(stdout), stderr: cut(stderr) }
  } catch (error) {
    if (error instanceof KeychainError && error.code === 'TIMEOUT') {
      return { exit_code: null, timed_out: true, stdout: cut(stdout), stderr: cut(stderr) }
    }
    throw error
  }
}

export async function serveMcp(): Promise<void> {
  const server = new Server({ name: 'akbun-keychain', version: VERSION }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map((tool) => ({ ...tool })) as never }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, args(request.params.arguments)))
  const transport = new StdioServerTransport()
  const closed = new Promise<void>((resolve) => {
    server.onclose = () => resolve()
  })
  await server.connect(transport)
  process.stdin.on('end', () => void server.close())
  await closed
}
