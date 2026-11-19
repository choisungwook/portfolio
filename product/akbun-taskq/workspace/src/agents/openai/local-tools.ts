import { execFile } from 'node:child_process'
import { closeSync, constants, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Config } from '../../config.ts'
import type { TeamAgent } from '../../db/team.ts'
import { botGate, type ApprovalBroker } from '../../team/bot-gate.ts'
import { realPath, under } from '../../worker/paths.ts'
import { worktreesDir } from '../../workspace/worktree.ts'

// The file and shell tools of an OpenAI bot. The OpenAI Agents SDK has no built-in coding tools and no permission
// modes, so taskq writes them and decides from the bot's permission mode which ones the bot gets:
//   plan               read_file, list_dir
//   acceptEdits        + write_file (inside the bot's workdir and the shared folder)
//   bypassPermissions  + shell (in the workdir; refused while the bot's sandbox setting is on, since taskq cannot
//                      sandbox a child process the way Claude Code does)
// Every call goes through the same gate as a Claude bot's tools (botGate): reaching taskq's data or config stops the
// turn, the user's ~/.claude and the bot's blocked commands are refused.

export interface LocalTool {
  name: string
  description: string
  parameters: Record<string, unknown>     // JSON schema
  run(args: Record<string, unknown>): Promise<string>
}

export class GateStop extends Error {}

const READ_LIMIT = 100_000
const SHELL_TIMEOUT_MS = 120_000
const OUTPUT_LIMIT = 20_000

export function localTools(config: Config, agent: TeamAgent, cwd: string, sharedDir: string, approvals?: ApprovalBroker): LocalTool[] {
  const gate = (tool: string, input: Record<string, unknown>): void => {
    const verdict = botGate(config, agent, cwd, tool, input, approvals)
    if (verdict.action === 'stop') throw new GateStop(verdict.reason)
    if (verdict.action === 'deny') throw new Error(verdict.reason)
  }
  const pathOf = (args: Record<string, unknown>) => resolve(cwd, String(args.path ?? '.'))
  const tools: LocalTool[] = [
    {
      name: 'read_file',
      description: 'Read a text file. Relative paths start at your working directory.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      async run(args) {
        const path = pathOf(args)
        gate('Read', { file_path: path })
        const text = readFileSync(path, 'utf8')
        return text.length > READ_LIMIT ? `${text.slice(0, READ_LIMIT)}\n…(${text.length - READ_LIMIT} more characters)` : text
      },
    },
    {
      name: 'list_dir',
      description: 'List a directory: names, with / after folders.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      async run(args) {
        const path = pathOf(args)
        gate('Glob', { path, pattern: '*' })
        return readdirSync(path).slice(0, 500).map((name) => {
          try {
            return statSync(resolve(path, name)).isDirectory() ? `${name}/` : name
          } catch {
            return name
          }
        }).join('\n')
      },
    },
  ]
  if (agent.permission_mode === 'acceptEdits' || agent.permission_mode === 'bypassPermissions') {
    tools.push({
      name: 'write_file',
      description: `Write a whole text file, creating folders as needed. Only inside your working directory (${cwd}) or the shared folder (${sharedDir}).`,
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false },
      async run(args) {
        const path = pathOf(args)
        gate('Write', { file_path: path })
        const real = realPath(dirname(path))
        const roots = [cwd, sharedDir, worktreesDir(config)]
        if (!roots.some((root) => under(real, realPath(root)))) throw new Error(`write_file is limited to ${roots.join(', ')}`)
        mkdirSync(dirname(path), { recursive: true })
        // O_NOFOLLOW: a symlink planted at the file's own name (shared/notes.md -> ~/.zshrc) is refused, not followed.
        const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644)
        try {
          writeSync(fd, String(args.content ?? ''))
        } finally {
          closeSync(fd)
        }
        return `wrote ${path}`
      },
    })
  }
  if (agent.permission_mode === 'bypassPermissions' && !agent.sandbox) {
    tools.push({
      name: 'shell',
      description: `Run a shell command in ${cwd} (bash -lc), at most ${SHELL_TIMEOUT_MS / 1000}s. Returns the exit code and output.`,
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false },
      run(args) {
        const command = String(args.command ?? '')
        gate('Bash', { command })
        return new Promise((done) => {
          execFile('bash', ['-lc', command], { cwd, timeout: SHELL_TIMEOUT_MS, maxBuffer: 4 * OUTPUT_LIMIT }, (error, stdout, stderr) => {
            const code = error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : error ? 1 : 0
            const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`
            done(`exit ${code}\n${out.length > OUTPUT_LIMIT ? `${out.slice(0, OUTPUT_LIMIT)}\n…(clipped)` : out}`)
          })
        })
      },
    })
  }
  return tools
}
