import { execFile, spawn } from 'node:child_process'
import { release } from 'node:os'
import type { AlertKind } from '../types.ts'

export interface Notice { title: string; body: string }

const LIMIT = 200
// The command the user runs from the notification. approval_required and security_finding name the task; auth_required resumes it.
const VERBS: Partial<Record<AlertKind, string>> = {
  approval_required: 'approve', auth_required: 'resume', security_finding: 'show', handoff_received: 'show',
}

// The body ends with the action, so the message is cut to make room for it and the action stays whole.
export function noticeFor(kind: AlertKind, taskId: string | null, message: string): Notice {
  const title = taskId ? `taskq · ${taskId}` : 'taskq'
  const verb = VERBS[kind]
  const action = taskId && verb ? `Open the taskq page or run: taskq ${verb} ${taskId}` : 'Open the taskq page.'
  if (!verb) return { title, body: message.slice(0, LIMIT) }
  const room = LIMIT - action.length - 1
  const head = message.length > room ? `${message.slice(0, room - 1)}…` : message
  return { title, body: `${head} ${action}` }
}

function macNotification(notice: Notice): string[] {
  return [
    '-e', 'on run argv',
    '-e', 'display notification (item 2 of argv) with title (item 1 of argv)',
    '-e', 'end run',
    notice.title,
    notice.body,
  ]
}

function windowsNotification(notice: Notice): string[] {
  // Only the base64 alphabet is interpolated into PowerShell source. The notice is decoded as JSON data.
  const payload = Buffer.from(JSON.stringify(notice), 'utf8').toString('base64')
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $notice = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $timer = New-Object System.Windows.Forms.Timer
    try {
      $icon.Icon = [System.Drawing.SystemIcons]::Information
      $icon.Text = 'taskq'
      $icon.Visible = $true
      $icon.ShowBalloonTip(10000, $notice.title, $notice.body, [System.Windows.Forms.ToolTipIcon]::Info)
      $timer.Interval = 15000
      $timer.Add_Tick({ [System.Windows.Forms.Application]::ExitThread() })
      $timer.Start()
      [System.Windows.Forms.Application]::Run()
    } finally {
      $timer.Dispose()
      $icon.Dispose()
    }
  `
  return ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}

export function desktopCommand(
  notice: Notice, platform: NodeJS.Platform, wslInterop?: string, kernelRelease = '',
): { file: string; args: string[] } | undefined {
  if (platform === 'darwin') return { file: 'osascript', args: macNotification(notice) }
  if (platform === 'win32' || (platform === 'linux' && (wslInterop || /microsoft-standard|wsl2/i.test(kernelRelease)))) {
    return { file: 'powershell.exe', args: windowsNotification(notice) }
  }
  return undefined
}

export function notifyDesktop(notice: Notice): void {
  if (process.env.TASKQ_NO_NOTIFY) return
  const command = desktopCommand(notice, process.platform, process.env.WSL_INTEROP, release())
  if (!command) return
  if (command.file === 'powershell.exe') {
    // The tray icon stays alive while the CLI exits.
    const helper = spawn(command.file, command.args, { windowsHide: true, stdio: 'ignore' })
    helper.on('error', () => {})
    helper.unref()
    return
  }
  execFile(command.file, command.args, { timeout: 20_000 }, () => {})
}
