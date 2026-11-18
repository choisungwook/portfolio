import { execFile } from 'node:child_process'
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

// Argv, never interpolated into the script text, so message content cannot inject AppleScript.
export function notifyDesktop(notice: Notice): void {
  if (process.platform !== 'darwin' || process.env.TASKQ_NO_NOTIFY) return
  execFile('osascript', [
    '-e', 'on run argv',
    '-e', 'display notification (item 2 of argv) with title (item 1 of argv)',
    '-e', 'end run',
    notice.title,
    notice.body,
  ], () => {})
}
