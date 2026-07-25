import { shell } from 'electron'
import { execFile } from 'node:child_process'
import type { OpenerApp } from '../shared/types'

export function listOpenerApps(): OpenerApp[] {
  const apps: OpenerApp[] = [
    { id: 'vscode', label: 'VS Code' },
    { id: 'file-manager', label: process.platform === 'darwin' ? 'Finder' : 'File Explorer' }
  ]
  if (process.platform === 'darwin') {
    apps.push({ id: 'terminal', label: 'Terminal' }, { id: 'iterm', label: 'iTerm' })
  }
  return apps
}

function exec(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve()
    })
  })
}

export async function openInApp(targetPath: string, appId: string): Promise<void> {
  if (appId === 'file-manager') {
    const error = await shell.openPath(targetPath)
    if (error) throw new Error(error)
    return
  }
  if (appId === 'vscode') {
    if (process.platform === 'darwin') {
      await exec('open', ['-a', 'Visual Studio Code', targetPath])
    } else {
      await exec('code', [targetPath])
    }
    return
  }
  if (appId === 'terminal') {
    await exec('open', ['-a', 'Terminal', targetPath])
    return
  }
  if (appId === 'iterm') {
    await exec('open', ['-a', 'iTerm', targetPath])
    return
  }
  throw new Error(`Unsupported app: ${appId}`)
}
