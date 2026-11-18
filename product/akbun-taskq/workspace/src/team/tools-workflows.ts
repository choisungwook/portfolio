import { z } from 'zod'
import { describeRun, getRun, listRuns, listWorkflows, reportStep } from '../db/workflows.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { startWorkflowFor, WORKFLOW_HOW } from './workflow-work.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

const RUN_ID = z.string().min(1).max(64)

export function workflowTools(scope: ScopedTools): TeamTool[] {
  const { db, agent, wrote } = scope
  return [
    {
      name: 'list_workflows',
      description: 'The workflows the user defined (name, description, steps) and your workflow runs that are still going.',
      input: {},
      readOnly: true,
      handler() {
        return {
          workflows: listWorkflows(db).map((w) => ({ id: w.id, name: w.name, description: w.description, steps: w.definition.steps.map((s) => `${s.id} (${s.kind})`) })),
          your_running_runs: listRuns(db, { bot: agent }).filter((r) => r.status === 'running').map((r) => ({ id: r.id, workflow: r.workflow_name, task_id: r.task_id, workflow_deleted: r.workflow_deleted })),
        }
      },
    },
    {
      name: 'run_workflow',
      description: 'Start a run of a workflow that you execute yourself, without a task. To have another bot run one, create or assign a task with that workflow to it.',
      input: { workflow: z.string().min(1).max(100) },
      readOnly: false,
      handler(args) {
        const started = startWorkflowFor(db, String(args.workflow), agent)
        if (!started.ok) throw new ToolError(started.error)
        wrote()
        return { run_id: started.run.id, workflow: describeRun(started.run), how: WORKFLOW_HOW }
      },
    },
    {
      name: 'workflow_status',
      description: 'The steps of a workflow run with their state (ready, running, succeeded, failed, skipped) and whether the run succeeded. Also says when the workflow was deleted.',
      input: { run_id: RUN_ID },
      readOnly: true,
      handler(args) {
        const run = getRun(db, String(args.run_id))
        if (!run) throw new ToolError('no such workflow run')
        return { status: run.status, summary: run.summary, workflow_deleted: run.workflow_deleted, steps: describeRun(run) }
      },
    },
    {
      name: 'workflow_step',
      description: `Report one step of a workflow run you execute. ${WORKFLOW_HOW}`,
      input: {
        run_id: RUN_ID,
        step_id: z.string().min(1).max(32),
        status: z.enum(['running', 'succeeded', 'failed', 'skipped']),
        output: z.string().max(4000).optional(),
        evidence: z.string().max(4000).optional(),
      },
      readOnly: false,
      handler(args) {
        const result = reportStep(db, String(args.run_id), agent, String(args.step_id), {
          status: args.status as 'running' | 'succeeded' | 'failed' | 'skipped', output: args.output as string | undefined, evidence: args.evidence as string | undefined,
        })
        if (!result.ok) throw new ToolError(result.error)
        wrote()
        const run = result.run
        if (run.status === 'failed') raiseAlert(db, { task_id: run.task_id, kind: 'failed', message: `Workflow "${run.workflow_name}" run by ${agent} failed: ${run.summary}` })
        return { run_status: run.status, summary: run.summary, steps: describeRun(run) }
      },
    },
  ]
}
