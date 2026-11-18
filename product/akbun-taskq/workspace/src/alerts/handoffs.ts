import type { Db } from '../db/open.ts'
import { takeHandoffNotices } from '../db/handoffs.ts'
import { eventWritten } from '../wake.ts'
import { noticeFor, notifyDesktop, type Notice } from './notify.ts'

export function sendHandoffNotices(db: Db, notify: (notice: Notice) => void = notifyDesktop): void {
  const notices = takeHandoffNotices(db)
  if (notices.length > 0) eventWritten.notify()
  for (const notice of notices) {
    notify(noticeFor('handoff_received', notice.target_task_id, notice.message))
  }
}
