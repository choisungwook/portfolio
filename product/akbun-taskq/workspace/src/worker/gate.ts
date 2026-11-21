import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { TaskType } from '../types.ts'
import { isReadOnlyAws, splitSegments } from './aws-guard.ts'
import { blocked, globMatches, realPath, resolvePath, under } from './paths.ts'

// The single policy table. The PreToolUse hook runs before allow rules, so these decisions hold in every permission mode.
// 'ask' sends the call to the permission prompt, where canUseTool waits for the user.
export type Decision = 'allow' | 'deny' | 'ask'

export interface GateContext {
  cwd: string          // the worker's working directory: relative paths resolve here
  outputs: string      // <home>/outputs
  repo?: string        // the task's repository, for code and security_review
  extraRepos?: string[] // the task's other repositories (their workspaces), writable like repo for code
  dataDir: string      // <home>/data, which holds the database
  profile?: string     // the target AWS profile of the task
  accessSkill?: string // the registered folder of the task's access skill (realpath)
  shared?: string      // TASKQ_HOME/shared, where attachments live; readable by every task type
  browserDir?: string  // TASKQ_HOME/browser, the bots' browser profiles: DevToolsActivePort there drives a browser
}

interface Touch { real: string; write: boolean }
type Input = Record<string, unknown>
type Check = (tool: string, input: Input, roots: Roots, touches: Touch[], ctx: GateContext) => Decision
interface Roots { cwd: string; outputs: string; repo?: string; extra: string[] }

const READ = new Set(['Read', 'Grep', 'Glob'])
const EDIT = new Set(['Write', 'Edit', 'MultiEdit'])
const WRITE_PATH = new Set([...EDIT, 'NotebookEdit'])
const GIT_READ = /^(diff|log|show)$/
const GIT_UNSAFE = ['--output', '--ext-diff', '--textconv', '--no-index']

// Read tools are confined by path because an allowed Read of a credential file plus any allowed network call is an
// exfiltration path. Bash has no text check in research and code: the sandbox (with denyRead) and auto mode are the control.
const POLICY: Record<TaskType, Check> = {
  research: (tool, _input, roots, touches) => {
    if (READ.has(tool)) return 'allow'
    if (EDIT.has(tool)) return inside(touches, [roots.outputs]) ? 'allow' : 'deny'
    return ['Bash', 'WebFetch', 'WebSearch'].includes(tool) ? 'allow' : 'deny'
  },
  code: (tool, _input, roots, touches) => {
    const repoRoots = [roots.repo, roots.outputs, ...roots.extra].filter((root): root is string => root !== undefined)
    if (READ.has(tool) || WRITE_PATH.has(tool)) return inside(touches, repoRoots) ? 'allow' : 'deny'
    return tool === 'Bash' ? 'allow' : 'deny'
  },
  ops_read: (tool, input, roots, touches, ctx) => {
    if (READ.has(tool)) return inside(touches, [roots.cwd, roots.outputs]) ? 'allow' : 'deny'
    if (tool === 'Skill') return 'allow'
    return tool === 'Bash' && isReadOnlyAws(commandOf(input), { profile: ctx.profile }) ? 'allow' : 'deny'
  },
  ops_change: (tool, input, roots, touches, ctx) => {
    if (READ.has(tool) && inside(touches, [roots.cwd, roots.outputs])) return 'allow'
    if (tool === 'Skill') return 'allow'
    return tool === 'Bash' && isReadOnlyAws(commandOf(input), { profile: ctx.profile }) ? 'allow' : 'ask'
  },
  security_review: (tool, input, roots, touches, ctx) => {
    if (READ.has(tool)) return inside(touches, [roots.repo, roots.outputs].filter(isString)) ? 'allow' : 'deny'
    if (tool === 'Write') return inside(touches, [roots.outputs]) ? 'allow' : 'deny'
    return tool === 'Bash' && gitReadOnly(commandOf(input), ctx.repo) ? 'allow' : 'deny'
  },
}

// StructuredOutput is how the worker hands its result back (Options.outputFormat): it touches nothing, and refusing it
// fails every run with "worker returned no valid structured result".
const RESULT_TOOL = 'StructuredOutput'

export function decide(type: TaskType, tool: string, input: Input, ctx: GateContext): Decision {
  if (tool === RESULT_TOOL) return 'allow'
  if (input.dangerouslyDisableSandbox === true || tool.startsWith('mcp__')) return 'deny'
  const places = { dataDir: realPath(ctx.dataDir) }
  const touches = touchesOf(tool, input, ctx)
  if (touches.some((touch) => blocked(touch.real, touch.write, places))) return 'deny'
  // The access skill folder is read-only for every type. Reads there are allowed; a symlink that leads out is not
  // inside it and goes through the type's own rules.
  if (ctx.accessSkill !== undefined && touches.length > 0 && inside(touches, [realPath(ctx.accessSkill)])) {
    if (WRITE_PATH.has(tool)) return 'deny'
    if (READ.has(tool)) return 'allow'
  }
  // Attachments and shared files are readable for every type, never writable from a task run.
  if (ctx.shared !== undefined && touches.length > 0 && inside(touches, [realPath(ctx.shared)])) {
    if (READ.has(tool)) return 'allow'
    if (WRITE_PATH.has(tool)) return 'deny'
  }
  const roots: Roots = {
    cwd: realPath(ctx.cwd),
    outputs: realPath(ctx.outputs),
    repo: ctx.repo === undefined ? undefined : realPath(ctx.repo),
    extra: (ctx.extraRepos ?? []).map(realPath),
  }
  return POLICY[type](tool, input, roots, touches, ctx)
}

// A call that reaches for taskq itself: turning the sandbox off, the database, the config, or Claude Code's own settings
// (hooks live there). decide() denies these too; the hook also stops the run so a person reviews it before a retry.
export function tamperOf(tool: string, input: Input, ctx: GateContext): string | null {
  if (input.dangerouslyDisableSandbox === true) return 'tried to run a command outside the sandbox'
  const dataDir = realPath(ctx.dataDir)
  const browserDir = ctx.browserDir ? realPath(ctx.browserDir) : null
  const claudeDir = realPath(join(homedir(), '.claude'))
  for (const touch of touchesOf(tool, input, ctx)) {
    const name = basename(touch.real)
    if (under(touch.real, dataDir) || globMatches(touch.real, join(dataDir, 'taskq.db'))) return `${tool} reached the taskq data directory`
    if (browserDir && (under(touch.real, browserDir) || globMatches(touch.real, join(browserDir, '*', 'DevToolsActivePort')))) return `${tool} reached a bot's browser profile`
    if (name === 'taskq.config.json' || globMatches(name, 'taskq.config.json')) return `${tool} reached the taskq config`
    if (name === 'taskq-ca-bundle.pem' || globMatches(name, 'taskq-ca-bundle.pem')) return `${tool} reached taskq's trusted CA bundle`
    if (touch.write && under(touch.real, claudeDir)) return `${tool} tried to write Claude Code settings`
  }
  return null
}

// Every path a file tool touches, resolved. A read with no path reads the working directory; a grep or glob pattern
// counts as a path when it has a slash or a tilde.
function touchesOf(tool: string, input: Input, ctx: GateContext): Touch[] {
  const write = WRITE_PATH.has(tool)
  const given = ['file_path', 'notebook_path', 'path'].map((key) => input[key]).filter(isString)
  const root = isString(input.path) ? resolvePath(ctx.cwd, input.path) : ctx.cwd
  const paths = given.map((path) => resolvePath(ctx.cwd, path))
  if ((tool === 'Glob' || tool === 'Grep') && isString(input.pattern) && /[/~]/.test(input.pattern)) {
    paths.push(resolvePath(root, input.pattern))
  }
  if (paths.length === 0 && READ.has(tool)) paths.push(resolvePath(ctx.cwd, '.'))
  return paths.map((real) => ({ real, write }))
}

// Every touched path must lie under one of the roots. An empty list never passes.
function inside(touches: Touch[], roots: string[]): boolean {
  return touches.length > 0 && touches.every((touch) => roots.some((root) => under(touch.real, root)))
}

function commandOf(input: Input): string {
  return isString(input.command) ? input.command : ''
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

// git prefers an exact match, so --text is the flag itself and not an abbreviation of --textconv.
function isUnsafeGitFlag(arg: string): boolean {
  if (!arg.startsWith('--') || arg === '--text') return false
  const name = arg.split('=')[0]
  return GIT_UNSAFE.some((unsafe) => arg.startsWith(unsafe) || (name.length >= 5 && unsafe.startsWith(name)))
}

// One git read command: exactly one segment, run against the task's repo with -C, and none of the flags that write
// a file or run a program. Abbreviations count, since git accepts them.
function gitReadOnly(command: string, repo: string | undefined): boolean {
  const segments = splitSegments(command)
  if (repo === undefined || segments === null || segments.length !== 1) return false
  const [git, flag, dir, sub, ...args] = segments[0]
  if (git !== 'git' || flag !== '-C' || dir !== repo || !GIT_READ.test(sub ?? '')) return false
  if (args.some(isUnsafeGitFlag)) return false
  if (args.some((arg) => /^-[^-]*O/.test(arg))) return false
  if (sub !== 'log' && !(args.includes('--no-ext-diff') && args.includes('--no-textconv'))) return false
  return true
}

// A resident team agent has Read, Glob and Grep only, confined to its own folder and the read roots. The same path
// resolution and sensitive-path checks as task sessions apply.
export function decideTeamRead(tool: string, input: Input, ctx: { cwd: string; roots: string[]; dataDir: string }): Decision {
  if (!READ.has(tool)) return 'deny'
  const gate: GateContext = { cwd: ctx.cwd, outputs: ctx.cwd, dataDir: ctx.dataDir }
  if (tamperOf(tool, input, gate) !== null) return 'deny'
  const touches = touchesOf(tool, input, gate)
  if (touches.some((touch) => blocked(touch.real, false, { dataDir: realPath(ctx.dataDir) }))) return 'deny'
  return inside(touches, [ctx.cwd, ...ctx.roots].map((root) => realPath(root))) ? 'allow' : 'deny'
}
