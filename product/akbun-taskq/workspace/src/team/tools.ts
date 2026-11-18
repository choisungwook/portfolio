import { z } from 'zod'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { noteWrite } from '../db/team.ts'
import { realPath, under } from '../worker/paths.ts'
import type { WikiSearch } from './search.ts'
import { taskTools } from './tools-tasks.ts'
import { talkTools } from './tools-talk.ts'
import { wikiTools } from './tools-wiki.ts'

// The tools every agent session gets, independent of the agent SDK. A backend wraps each one in its own tool format.
// A handler returns a JSON object, or throws ToolError with a message the model can act on.

export class ToolError extends Error {}

export interface TeamTool {
  name: string
  description: string
  input: z.ZodRawShape
  readOnly: boolean
  handler(args: Record<string, unknown>): Record<string, unknown>
}

export interface ToolScope {
  db: Db
  config: Config
  agent: string
  search: WikiSearch
  turnId?: number    // the turn these tools serve; a write is recorded on it so a failed turn is not retried
}

export interface ScopedTools extends ToolScope {
  wrote(): void
}

export function teamTools(scope: ToolScope): TeamTool[] {
  const scoped: ScopedTools = {
    ...scope,
    wrote: () => {
      if (scope.turnId !== undefined) noteWrite(scope.db, scope.turnId)
    },
  }
  return [...talkTools(scoped), ...taskTools(scoped), ...wikiTools(scoped)].map(validated)
}

// The input schema is checked here as well as by the SDK, so a backend that skips it, or a test, cannot pass an
// out-of-range value (a priority above the agent limit, an unknown key) into a handler.
function validated(t: TeamTool): TeamTool {
  const schema = z.object(t.input).strict()
  return {
    ...t,
    handler(args) {
      const parsed = schema.safeParse(args)
      if (!parsed.success) throw new ToolError(`invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`)
      return t.handler(parsed.data as Record<string, unknown>)
    },
  }
}

// The real path is compared, so a symlink inside a read root cannot point a code task at a directory outside it.
export function repoAllowed(config: Config, repo: string): boolean {
  const real = realPath(repo)
  return config.trustedRepos.some((trusted) => realPath(trusted) === real) || config.bots.readRoots.some((root) => under(real, realPath(root)))
}
