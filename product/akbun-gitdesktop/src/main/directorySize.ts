import { lstat, opendir } from 'node:fs/promises'
import path from 'node:path'

export async function directorySize(rootPath: string): Promise<number> {
  const pending = [rootPath]
  let bytes = 0

  while (pending.length > 0) {
    const current = pending.pop()!
    const entries = await opendir(current)
    for await (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else {
        bytes += (await lstat(entryPath)).size
      }
    }
  }

  return bytes
}
