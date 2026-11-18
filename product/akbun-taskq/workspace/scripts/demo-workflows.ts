import type { Db } from '../src/db/open.ts'
import { createWorkflow, deleteWorkflow, reportStep, startRun, endRun } from '../src/db/workflows.ts'

// Demo workflows: a release flow with one run in progress (waiting for approval) and one that failed, and a deleted
// workflow whose run stays in the history.
export function seedWorkflows(db: Db, taskId: string): void {
  const release = createWorkflow(db, {
    name: 'release', description: 'Build, test, review, then the user approves the release',
    definition: {
      steps: [
        { id: 'build', name: 'Build', kind: 'do', instructions: 'npm run build', needs: [] },
        { id: 'test', name: 'Run tests', kind: 'check', instructions: 'npm test; paste the summary as evidence', needs: ['build'] },
        { id: 'review', name: 'Security review', kind: 'handoff', instructions: 'Ask the reviewer for a security review of the diff', needs: ['build'], to: 'reviewer' },
        { id: 'approve', name: 'User approves', kind: 'approval', instructions: '', needs: ['test', 'review'] },
      ],
    },
  })
  const running = startRun(db, { workflow: release, bot: 'coder', taskId })
  reportStep(db, running.id, 'coder', 'build', { status: 'succeeded', output: 'built in 4.2s' })
  reportStep(db, running.id, 'coder', 'test', { status: 'succeeded', output: '120 tests passed', evidence: '$ npm test\n# pass 120\n# fail 0' })
  reportStep(db, running.id, 'coder', 'review', { status: 'succeeded', output: 'reviewer: nothing blocking' })
  reportStep(db, running.id, 'coder', 'approve', { status: 'running', output: 'asked the user' })
  const failed = startRun(db, { workflow: release, bot: 'planner' })
  reportStep(db, failed.id, 'planner', 'build', { status: 'failed', output: 'tsc: 3 errors' })
  const docs = createWorkflow(db, {
    name: 'docs-check', description: 'Check that the docs match the code',
    definition: { steps: [{ id: 'read', name: 'Read the diff', kind: 'do', instructions: '', needs: [] }, { id: 'check', name: 'Compare with the docs', kind: 'check', instructions: '', needs: ['read'] }] },
  })
  const old = startRun(db, { workflow: docs, bot: 'doc-reviewer' })
  endRun(db, old.id, 'cancelled', 'cancelled by the user')
  deleteWorkflow(db, docs.id)
}
