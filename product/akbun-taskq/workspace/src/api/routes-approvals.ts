import type { Hono } from 'hono'
import { listOpenApprovals } from '../db/approvals.ts'
import type { ApiDeps } from './http.ts'

export function registerApprovalRoutes(api: Hono, { db }: ApiDeps): void {
  api.get('/approvals', (c) => c.json(listOpenApprovals(db)))
}
