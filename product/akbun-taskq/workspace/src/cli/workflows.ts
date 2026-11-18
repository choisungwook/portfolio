import { readFileSync } from 'node:fs'
import { findOperation } from '../ops/operations.ts'
import { localApi } from '../ops/local-api.ts'
import type { Command } from './types.ts'

// `taskq workflows`: the Workflows view from a shell. Each subcommand is one operation of `taskq api`, printed for
// reading instead of as JSON.
const USAGE = `taskq workflows list [--deleted]
  show ID|NAME              the steps
  create FILE               FILE is JSON: { "name", "description", "definition": { "steps": [...] } }
  update ID FILE
  delete ID
  run ID --bot NAME [--task TASK]
  runs [--bot NAME] [--workflow ID] [--task TASK]
  run-show RUN_ID           every step with status, output and evidence
  cancel RUN_ID
  approve RUN_ID STEP [--reject] [--note TEXT]`

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

export const workflows: Command = async ({ config, db }, args) => {
  const call = localApi(db, config)
  const run = async (name: string, input: Record<string, unknown>) => {
    const result = await call(findOperation(name)!, input)
    if (result.status >= 400) throw new Error((result.body as { error?: string })?.error ?? `HTTP ${result.status}`)
    return result.body as never
  }
  const [sub, a, b] = args
  type Step = { id: string; name: string; kind: string; needs: string[]; to?: string }
  type StepState = { step_id: string; status: string; output: string | null; evidence: string | null }
  type Run = { id: string; workflow_name: string; workflow_deleted: boolean; bot: string; task_id: string | null; status: string; summary: string | null; started_at: number }
  const line = (r: Run) => `${r.id.slice(0, 8)}  ${r.status.padEnd(9)} ${r.workflow_name}${r.workflow_deleted ? ' (deleted)' : ''}  bot ${r.bot}${r.task_id ? `  task ${r.task_id}` : ''}  ${new Date(r.started_at * 1000).toISOString().slice(0, 16)}`
  switch (sub) {
    case undefined:
    case 'list': {
      const list = await run('workflows_list', args.includes('--deleted') ? { deleted: 1 } : {}) as { id: string; name: string; deleted_at: number | null; runs: number; last_status: string | null; definition: { steps: Step[] } }[]
      for (const w of list) console.log(`${w.id.slice(0, 8)}  ${w.name}${w.deleted_at ? ' (deleted)' : ''}  ${w.definition.steps.length} steps  ${w.runs} runs${w.last_status ? `, last ${w.last_status}` : ''}`)
      if (list.length === 0) console.log('no workflows')
      return
    }
    case 'show': {
      const w = await run('workflow_get', { id: a }) as { name: string; description: string; definition: { steps: Step[] } }
      console.log(`${w.name}: ${w.description}`)
      for (const s of w.definition.steps) console.log(`  ${s.id} (${s.kind}${s.to ? ` → ${s.to}` : ''}) ${s.name}${s.needs.length ? `  after ${s.needs.join(', ')}` : ''}`)
      return
    }
    case 'create':
    case 'update': {
      const file = sub === 'create' ? a : b
      if (!file) throw new Error(USAGE)
      const body = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      const saved = await run(sub === 'create' ? 'workflow_create' : 'workflow_update', sub === 'create' ? body : { ...body, id: a }) as { id: string; name: string }
      console.log(`${saved.id} ${saved.name}`)
      return
    }
    case 'delete': {
      const result = await run('workflow_delete', { id: a }) as { told: string[] }
      console.log(`deleted${result.told.length ? `; told ${result.told.join(', ')}` : ''}`)
      return
    }
    case 'run': {
      const bot = flag(args, '--bot')
      if (!a || !bot) throw new Error(USAGE)
      console.log(line(await run('workflow_run', { id: a, bot, task_id: flag(args, '--task') })))
      return
    }
    case 'runs': {
      const list = await run('workflow_runs', { bot: flag(args, '--bot'), workflow: flag(args, '--workflow'), task: flag(args, '--task') }) as Run[]
      for (const r of list) console.log(line(r))
      if (list.length === 0) console.log('no runs')
      return
    }
    case 'run-show': {
      const r = await run('workflow_run_get', { id: a }) as Run & { snapshot: { steps: Step[] }; steps: StepState[] }
      console.log(line(r))
      if (r.summary) console.log(`  ${r.summary}`)
      for (const step of r.snapshot.steps) {
        const s = r.steps.find((x) => x.step_id === step.id)!
        console.log(`  [${s.status}] ${step.id} ${step.name}${s.output ? `\n      ${s.output.replace(/\n/g, '\n      ')}` : ''}${s.evidence ? `\n      evidence: ${s.evidence.replace(/\n/g, '\n      ')}` : ''}`)
      }
      return
    }
    case 'cancel':
      await run('workflow_run_cancel', { id: a })
      console.log('cancelled')
      return
    case 'approve':
      await run('workflow_step_approve', { id: a, step: b, approved: !args.includes('--reject'), note: flag(args, '--note') ?? '' })
      console.log(args.includes('--reject') ? 'rejected' : 'approved')
      return
    default:
      throw new Error(USAGE)
  }
}
