import type { Db } from '../db/open.ts'
import type { AlertKind, Severity } from '../types.ts'
import { insertAlert } from '../db/alerts.ts'
import { desktopNotificationsEnabled } from '../db/meta.ts'
import { noticeFor, notifyDesktop, type Notice } from './notify.ts'
import { mask } from '../mask.ts'

// Default severity per kind. worker_flag takes the severity the worker reports.
export const SEVERITY: Record<AlertKind, Severity> = {
  approval_required: 'critical',
  security_finding: 'critical',
  prod_touch: 'critical',
  auth_required: 'critical',
  failed: 'high',
  stale_repeat: 'high',
  worker_flag: 'high',
  budget_exceeded: 'normal',
  review_ready: 'normal',
  proposal_pending: 'normal',
  handoff_received: 'normal',
  team_message: 'normal',
  team_paused: 'high',
}

// The notification is shown outside the database, so it gets the masked message too. notify is injectable for tests.
export function raiseAlert(db: Db, alert: {
  task_id: string | null; run_id?: string | null; kind: AlertKind; message: string; severity?: Severity; ref?: string | null
}, notify: (notice: Notice) => void = notifyDesktop): void {
  const severity = alert.severity ?? SEVERITY[alert.kind]
  const message = mask(alert.message)
  insertAlert(db, { task_id: alert.task_id, run_id: alert.run_id ?? null, severity, kind: alert.kind, message, ref: alert.ref ?? null })
  if (severity === 'critical' && desktopNotificationsEnabled(db)) {
    notify(noticeFor(alert.kind, alert.task_id, message))
  }
}
