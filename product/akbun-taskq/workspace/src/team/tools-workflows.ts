import { z } from 'zod'
import { createWorkflow, describeRun, getRun, getWorkflow, listRuns, listWorkflows, parseDefinition, reportStep, updateWorkflow } from '../db/workflows.ts'
import { builtinSkillInfo } from './builtin-skill.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { startWorkflowFor, WORKFLOW_HOW } from './workflow-work.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

const RUN_ID = z.string().min(1).max(64)

// A workflow definition as a bot writes it; parseDefinition checks the steps and returns why one is wrong.
const DEFINITION = z.object({ steps: z.array(z.record(z.string(), z.unknown())).min(1) })
const NAME = z.string().min(1).max(80)

function definitionOf(input: unknown) {
  const parsed = parseDefinition(input)
  if (!parsed.ok) throw new ToolError(parsed.error)
  return parsed.value
}

export function workflowTools(scope: ScopedTools): TeamTool[] {
  const { db, agent, wrote, config } = scope
  return [
    {
      name: 'taskq_info',
      description: 'Which taskq you run inside: its version, its home folder and the path of the manual of this version (read the section you need).',
      input: {},
      readOnly: true,
      handler() {
        const info = builtinSkillInfo(config)
        return { app: 'akbun-taskq', version: info.version, home: config.home, manual: info.manual, skill: info.path }
      },
    },
    {
      name: 'create_workflow',
      description: 'Make a workflow: a reusable graph of steps (kind do, check, handoff or approval, with needs). See the taskq skill for the format. The user runs it from Workflows or gives a task with it to a bot.',
      input: { name: NAME, description: z.string().max(1000).optional(), definition: DEFINITION },
      readOnly: false,
      handler(args) {
        try {
          const workflow = createWorkflow(db, { name: String(args.name).trim(), description: (args.description as string | undefined) ?? '', definition: definitionOf(args.definition) })
          wrote()
          return { id: workflow.id, name: workflow.name, steps: workflow.definition.steps.map((step) => step.id) }
        } catch (error) {
          if (String(error).includes('UNIQUE')) throw new ToolError('a workflow with that name exists; use update_workflow or another name')
          throw error
        }
      },
    },
    {
      name: 'update_workflow',
      description: 'Replace a workflow\'s name, description and steps. Runs already started keep the steps they started with.',
      input: { workflow: z.string().min(1).max(100), name: NAME.optional(), description: z.string().max(1000).optional(), definition: DEFINITION },
      readOnly: false,
      handler(args) {
        const current = getWorkflow(db, String(args.workflow))
        if (!current || current.deleted_at !== null) throw new ToolError('no such workflow')
        let workflow
        try {
          workflow = updateWorkflow(db, current.id, {
            name: args.name === undefined ? current.name : String(args.name).trim(),
            description: (args.description as string | undefined) ?? current.description,
            definition: definitionOf(args.definition),
          })
        } catch (error) {
          if (String(error).includes('UNIQUE')) throw new ToolError('another workflow has that name')
          throw error
        }
        if (!workflow) throw new ToolError('no such workflow')
        wrote()
        return { id: workflow?.id, name: workflow?.name, steps: workflow?.definition.steps.map((step) => step.id) }
      },
    },
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
