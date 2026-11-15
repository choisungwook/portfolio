import type { Db } from './open.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'

export interface ProposalRow {
  id: number; task_id: string | null; kind: string; target_path: string; diff: string; status: string; created_at: number
}

export function insertProposal(db: Db, proposal: {
  task_id: string | null; kind: 'memory' | 'skill'; target_path: string; diff: string
}): number {
  const result = db.prepare(`INSERT INTO proposals (task_id, kind, target_path, diff, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(proposal.task_id, proposal.kind, proposal.target_path, mask(proposal.diff), nowSec())
  return Number(result.lastInsertRowid)
}

export function listProposals(db: Db, status?: string): ProposalRow[] {
  return db.prepare('SELECT * FROM proposals WHERE (? IS NULL OR status = ?) ORDER BY id DESC')
    .all(status ?? null, status ?? null) as unknown as ProposalRow[]
}

export function getProposal(db: Db, id: number): ProposalRow | undefined {
  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as unknown as ProposalRow | undefined
}

export function setProposalStatus(db: Db, id: number, status: 'applied' | 'rejected'): void {
  db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run(status, id)
}
