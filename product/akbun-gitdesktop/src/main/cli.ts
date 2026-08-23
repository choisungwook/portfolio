import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/run/current-system/sw/bin'
]

export function commandPaths(command: string): string[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) throw new Error(`Invalid CLI command: ${command}`)
  if (process.platform === 'win32') return [command]

  const homePaths = [
    path.join(os.homedir(), 'bin'),
    path.join(os.homedir(), '.local/bin'),
    path.join(os.homedir(), '.nix-profile/bin'),
    path.join(os.homedir(), '.asdf/shims'),
    path.join(os.homedir(), '.local/share/mise/shims')
  ]
  const envPaths = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  return [...new Set([...envPaths, ...EXTRA_PATHS, ...homePaths])].map((dir) => path.join(dir, command))
}

export async function resolveCli(command: string): Promise<string> {
  for (const candidate of commandPaths(command)) {
    if (process.platform === 'win32') return candidate
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return command
}

export async function runCli(cwd: string | undefined, command: string, args: string[]): Promise<string> {
  const executable = await resolveCli(command)
  return new Promise((resolve, reject) => {
    execFile(executable, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

export async function probeCli(
  command: string,
  args: string[]
): Promise<{ ok: boolean; output: string; path: string }> {
  const executable = await resolveCli(command)
  return new Promise((resolve) => {
    execFile(executable, args, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}${stderr}`.trim(), path: error ? '' : executable })
    })
  })
}
