import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Files read at run time, keyed by their path under the workspace (`ui/index.html`). A checkout reads them from disk.
// The compiled binary embeds them and registers the embedded paths before main runs.
const WORKSPACE = fileURLToPath(new URL('..', import.meta.url))

let embedded: Map<string, string> | undefined

export function registerEmbedded(files: Map<string, string>): void {
  embedded = files
}

export function readResource(relative: string): Buffer | undefined {
  const path = embedded ? embedded.get(relative) : join(WORKSPACE, relative)
  if (!path) return undefined
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}
