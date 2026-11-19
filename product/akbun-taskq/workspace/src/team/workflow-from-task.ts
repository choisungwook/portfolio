import type { Db } from '../db/open.ts'
import { getTask } from '../db/tasks.ts'
import { createWorkflow, parseDefinition, type Workflow } from '../db/workflows.ts'

// Teach by doing: a task that ended done becomes a workflow, so the same work can be handed to a bot again. The steps
// come from what happened: the intent and cautions, the summary of the run that succeeded, and the commands and files
// its tool calls touched. It is a draft to edit in the workflow editor, not a recording that replays itself.

const MAX_COMMANDS = 30

export function workflowFromTask(db: Db, taskId: string): Workflow | string {
  const task = getTask(db, taskId)
  if (!task) return 'task not found'
  if (task.status !== 'done') return `only a task that ended done can become a workflow (this one is ${task.status})`
  const run = db.prepare(`SELECT id, summary FROM runs WHERE task_id = ? AND outcome = 'done' ORDER BY ended_at DESC LIMIT 1`).get(taskId)
  const events = run
    ? db.prepare(`SELECT payload FROM events WHERE run_id = ? AND kind = 'tool_call' ORDER BY id`).all(run.id).map((row) => JSON.parse(String(row.payload)) as { tool?: string; input?: Record<string, unknown> })
    : []
  const commands = [...new Set(events.filter((e) => e.tool === 'Bash' && typeof e.input?.command === 'string').map((e) => String(e.input?.command).split('\n')[0].slice(0, 200)))].slice(0, MAX_COMMANDS)
  const files = [...new Set(events.filter((e) => ['Write', 'Edit', 'MultiEdit'].includes(String(e.tool)) && typeof e.input?.file_path === 'string').map((e) => String(e.input?.file_path)))].slice(0, MAX_COMMANDS)
  const summary = run?.summary ? String(run.summary).slice(0, 2000) : ''
  const work = [
    task.data.intent,
    task.data.cautions ? `Cautions: ${task.data.cautions}` : '',
    summary ? `What worked last time (task ${task.id}):\n${summary}` : '',
    commands.length ? `Commands used last time:\n${commands.map((c) => `- ${c}`).join('\n')}` : '',
    files.length ? `Files changed last time:\n${files.map((f) => `- ${f}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  const parsed = parseDefinition({
    steps: [
      { id: 'do', name: 'Do the work', kind: 'do', instructions: work.slice(0, 8000), needs: [] },
      { id: 'check', name: 'Check the result', kind: 'check', instructions: `Show evidence that it worked, the way the last run did${summary ? `: ${summary.slice(0, 500)}` : ''}.`, needs: ['do'] },
    ],
  })
  if (!parsed.ok) return parsed.error
  const title = (task.data.title ?? task.data.intent).replace(/\s+/g, ' ').slice(0, 60)
  return createWorkflow(db, { name: `${title} (from ${task.id})`, description: `Saved from task ${task.id} after it ended done.`, definition: parsed.value })
}
