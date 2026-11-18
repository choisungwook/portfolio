import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Opens a folder in the desktop file manager of the machine taskq runs on (the API binds to 127.0.0.1, so that is the
// user's own machine). Only folders taskq names itself are opened; the path never comes from the request.
export type Opener = (path: string) => void

export const openWithSystem: Opener = (path) => {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  spawn(command, [path], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
}

// Where Claude Code keeps session transcripts: one folder per working directory under projects/.
export function claudeProjectsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
}

// Claude Code names a project folder after the working directory with every character that is not a letter or digit
// replaced by '-'. Checked against the folder's existence by the caller, since the naming is the CLI's, not an API.
export function sessionFolder(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(claudeProjectsDir(env), cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

export function existing(path: string): string | null {
  return existsSync(path) ? path : null
}
