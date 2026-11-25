// VisionLlm on the user's ChatGPT plan: one call is one `codex exec --experimental-json` of the Codex CLI the user
// installed and signed in to (`codex login`). The CLI is spawned directly with the arguments @openai/codex-sdk would
// pass, so the app does not ship the Codex binary that SDK depends on. Codex is a coding agent, so it runs in a
// read-only sandbox inside an empty folder and gets the image with --image. The plan has no per-call price.

import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createInterface } from 'node:readline'
import type { Availability, TaskContext, VisionLlm, VisionRequest, VisionResult } from '../../core/ports.ts'

type CodexEvent = {
  type: string
  item?: { type: string; text?: string }
  usage?: { input_tokens: number; cached_input_tokens?: number; output_tokens: number }
  error?: { message: string }
  message?: string
}

const SIGNED_OUT = /not logged in|codex login|401 unauthori[sz]ed|token (has )?expired/i

export function codexArgs(req: VisionRequest, modelId: string, cwd: string): string[] {
  const args = ['exec', '--experimental-json', '--skip-git-repo-check', '--sandbox', 'read-only', '--cd', cwd]
  args.push('--config', `developer_instructions=${JSON.stringify(req.system)}`, '--config', 'approval_policy="never"')
  if (modelId) args.push('--model', modelId)
  for (const image of req.images) args.push('--image', image)
  return args
}

// Reads the JSONL stream: the last agent_message is the answer, turn.completed carries the token counts.
export function readCodexEvents(lines: string[]): VisionResult {
  let text = ''
  let failure: string | undefined
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  for (const line of lines) {
    let event: CodexEvent
    try {
      event = JSON.parse(line) as CodexEvent
    } catch {
      continue
    }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) text = event.item.text
    else if (event.type === 'turn.completed' && event.usage) {
      usage.inputTokens += event.usage.input_tokens
      usage.outputTokens += event.usage.output_tokens
    } else if (event.type === 'turn.failed') failure = event.error?.message ?? 'the Codex turn failed'
    else if (event.type === 'error') failure = event.message ?? 'Codex reported an error'
  }
  if (failure) throw new Error(failure)
  return { text, usage }
}

export function createCodexVision(codexPath: string, modelId: string): VisionLlm {
  return {
    id: 'codex',
    modelId,
    async available(): Promise<Availability> {
      return new Promise((resolve) => {
        const child = spawn(codexPath, ['login', 'status'], { stdio: 'ignore' })
        child.once('error', () => resolve({ ok: false, reason: 'not-installed', hint: `Install the Codex CLI or set its path (${codexPath}).` }))
        child.once('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, reason: 'not-logged-in', hint: 'Run `codex login` and choose Sign in with ChatGPT.' }))
      })
    },
    async complete(req: VisionRequest, ctx: TaskContext): Promise<VisionResult> {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'akbun-piano-teacher-codex-'))
      try {
        const child = spawn(codexPath, codexArgs(req, modelId, cwd), { signal: ctx.signal, stdio: ['pipe', 'pipe', 'pipe'] })
        const stderr: Buffer[] = []
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
        const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
          child.once('error', (error) => resolve({ code: null, error }))
          child.once('exit', (code) => resolve({ code }))
        })
        // A codex that exits early makes this write fail with EPIPE; the exit code reports it, so do not let it crash main.
        child.stdin.on('error', () => {})
        child.stdin.end(req.prompt)
        const lines: string[] = []
        for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) lines.push(line)
        const { code, error } = await exit
        const tail = Buffer.concat(stderr).toString('utf8').slice(-400)
        if (error) throw /ENOENT/.test(error.message) ? new Error(`Codex CLI not found at ${codexPath}`) : error
        if (code !== 0) throw new Error(SIGNED_OUT.test(tail) ? 'Codex is not signed in: run `codex login`' : `codex exited with ${code}: ${tail}`)
        return readCodexEvents(lines)
      } finally {
        await fs.rm(cwd, { recursive: true, force: true })
      }
    },
  }
}
