import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Files read at runtime, keyed by their path relative to workspace (`ui/index.html`, `skills/aimemory/SKILL.md`).
// A checkout reads them from disk. The compiled binary embeds them and registers their paths before CLI entry runs.
const WORKSPACE = fileURLToPath(new URL('..', import.meta.url))

let embedded: Map<string, string> | undefined

export function registerEmbedded(files: Map<string, string>): void {
  embedded = files
}

export function isEmbedded(): boolean {
  return embedded !== undefined
}

export function resourcePath(relative: string): string | undefined {
  return embedded ? embedded.get(relative) : join(WORKSPACE, relative)
}
