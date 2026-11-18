import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { OPERATIONS, findOperation, pathParams, type Operation } from '../ops/operations.ts'
import { localApi } from '../ops/local-api.ts'
import type { Command } from './types.ts'

// `taskq api` reaches every API route by its operation name (src/ops/operations.ts), so anything the UI does can be
// done from a shell or a script:
//   taskq api                                   list the operations
//   taskq api bot_update name=coder model=claude-sonnet-5-5 effort=high
//   taskq api workflow_create --json '{"name":"release","definition":{"steps":[...]}}'
//   taskq api file_upload file=./report.md      (reads the file and sends it as base64)
// A value that parses as JSON (true, 3, [..], {..}, null) is sent as that value, anything else as text.

export function parseArgs(args: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--json') {
      const value = JSON.parse(args[i + 1] ?? '{}') as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('--json takes a JSON object')
      Object.assign(out, value)
      i += 1
      continue
    }
    const eq = arg.indexOf('=')
    if (eq <= 0) throw new Error(`expected key=value, got "${arg}"`)
    const key = arg.slice(0, eq)
    const raw = arg.slice(eq + 1)
    try {
      out[key] = JSON.parse(raw)
    } catch {
      out[key] = raw
    }
  }
  return out
}

export function usageOf(operation: Operation): string {
  const params = pathParams(operation.path).map((p) => `${p}=…`).join(' ')
  return `${operation.name}${params ? ` ${params}` : ''}\n    ${operation.method} ${operation.path} — ${operation.description}`
}

export const api: Command = async ({ config, db }, args) => {
  const [name, ...rest] = args
  if (!name || name === 'list' || name === '--help') {
    console.log(OPERATIONS.map(usageOf).join('\n'))
    return
  }
  const operation = findOperation(name)
  if (!operation) throw new Error(`unknown operation ${name}; taskq api lists them`)
  const input = parseArgs(rest)
  if (operation.name === 'file_upload' && typeof input.file === 'string') {
    input.name ??= basename(input.file)
    input.data = readFileSync(input.file).toString('base64')
    delete input.file
  }
  const result = await localApi(db, config)(operation, input)
  const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)
  if (result.status >= 400) throw new Error(`${result.status}: ${text}`)
  console.log(text)
}
