import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import { getAgent, postMessage, SYSTEM } from '../db/team.ts'
import { deleteWorkflow, describeRun, endRun, getRun, getWorkflow, runningRunForTask, startRun, type Workflow, type WorkflowRun } from '../db/workflows.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { teamChanged } from '../wake.ts'

// The bot side of workflows: who is told what, and when. A run is executed by exactly one bot. The bot learns about
// the run, its deletion and its cancellation through its mailbox, so it knows even mid-turn (live input).

export const WORKFLOW_HOW = 'Do the ready steps in order. Report each one with workflow_step: running when you begin, then succeeded (with output; a check step also needs evidence: the command and its output), failed, or skipped (with the reason). A handoff step: send_message to its bot, and report it when the answer comes. An approval step: set it running and tell the user; only the user can approve it. taskq decides when the run succeeded; do not call it done yourself.'

export function startWorkflowFor(db: Db, workflowRef: string, bot: string, taskId: string | null = null): { ok: true; run: WorkflowRun } | { ok: false; error: string } {
  const workflow = getWorkflow(db, workflowRef)
  if (!workflow || workflow.deleted_at !== null) return { ok: false, error: `no workflow ${workflowRef}` }
  const agent = getAgent(db, bot)
  if (!agent) return { ok: false, error: `no bot ${bot}` }
  if (!agent.enabled) return { ok: false, error: `${bot} is disabled` }
  const run = inTransaction(db, () => {
    const started = startRun(db, { workflow, bot, taskId })
    postMessage(db, { sender: SYSTEM, recipient: bot, task_id: taskId, body: `You run workflow "${workflow.name}" (run ${started.id}).\n${describeRun(started)}\n\n${WORKFLOW_HOW}` })
    return started
  })
  teamChanged.notify()
  return { ok: true, run }
}

// A task with a workflow, started by its owner: the run starts with it, or the run left from an earlier turn continues.
export function workflowForTask(db: Db, task: { id: string; data: { workflow_id?: string } }, bot: string): WorkflowRun | { error: string } | undefined {
  if (!task.data.workflow_id) return undefined
  const existing = runningRunForTask(db, task.id)
  if (existing) return existing.bot === bot ? existing : { error: `workflow run ${existing.id} of this task is executed by ${existing.bot}` }
  const workflow = getWorkflow(db, task.data.workflow_id)
  if (!workflow || workflow.deleted_at !== null) return { error: `the task's workflow ${task.data.workflow_id} was deleted; ask the user to pick another or remove it from the task` }
  return startRun(db, { workflow, bot, taskId: task.id })
}

export function removeWorkflow(db: Db, workflow: Workflow): { deleted: boolean; told: string[] } {
  const { deleted, running } = deleteWorkflow(db, workflow.id)
  for (const run of running) {
    postMessage(db, { sender: SYSTEM, recipient: run.bot, body: `The user deleted workflow "${workflow.name}". Your run ${run.id} continues on the copy it started with; finish it, or ask the user whether to stop.` })
  }
  if (running.length) teamChanged.notify()
  return { deleted, told: running.map((r) => r.bot) }
}

export function cancelWorkflowRun(db: Db, runId: string, why = 'cancelled by the user'): boolean {
  const run = getRun(db, runId)
  if (!run || !endRun(db, runId, 'cancelled', why)) return false
  postMessage(db, { sender: SYSTEM, recipient: run.bot, task_id: run.task_id, body: `Workflow run ${runId} ("${run.workflow_name}") was ${why}. Stop its remaining steps.` })
  teamChanged.notify()
  return true
}

// Tells the executing bot about a step the user answered, and raises an alert for a failed run.
export function afterUserStep(db: Db, run: WorkflowRun, stepId: string): void {
  const state = run.steps.find((s) => s.step_id === stepId)
  postMessage(db, { sender: SYSTEM, recipient: run.bot, task_id: run.task_id, body: `The user answered step ${stepId} of run ${run.id}: ${state?.output ?? state?.status}.\n${describeRun(run)}` })
  if (run.status === 'failed') raiseAlert(db, { task_id: run.task_id, kind: 'failed', message: `Workflow "${run.workflow_name}" failed: ${run.summary}` })
  teamChanged.notify()
}
