import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFromBunfs } from '@anthropic-ai/claude-agent-sdk/extract'

// Files read at run time, keyed by their path under the workspace (`ui/index.html`, `src/db/schema/001_init.sql`).
// A checkout reads them from disk. The compiled binary embeds them and registers the embedded paths before main runs.
const WORKSPACE = fileURLToPath(new URL('..', import.meta.url))

interface Embedded {
  files: Map<string, string>
  claude: string
}

let embedded: Embedded | undefined
let extractedClaude: string | undefined

export function registerEmbedded(files: Map<string, string>, claude: string): void {
  embedded = { files, claude }
}

// True only in the compiled binary, whose entry registers the embedded files before main runs.
export function isEmbedded(): boolean {
  return embedded !== undefined
}

export function resourcePath(relative: string): string | undefined {
  return embedded ? embedded.files.get(relative) : join(WORKSPACE, relative)
}

// A child process cannot run a file inside the binary, so the bundled Claude Code is copied out once on first use.
// A checkout returns undefined and the SDK finds Claude Code in node_modules itself.
export function claudeExecutable(): string | undefined {
  if (!embedded) return undefined
  extractedClaude ??= extractFromBunfs(embedded.claude)
  return extractedClaude
}
