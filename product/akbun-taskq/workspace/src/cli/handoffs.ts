import { parseArgs } from 'node:util'
import { acceptHandoff, handoffMode, listHandoffs, setHandoffMode } from '../db/handoffs.ts'
import type { Command } from './types.ts'

export const handoffs: Command = ({ db }, args) => {
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: { task: { type: 'string' } },
  })
  console.log(JSON.stringify(listHandoffs(db, values.task), null, 2))
}

export const handoff: Command = ({ db }, args) => {
  const [action, id, mode, ...rest] = args
  if (action === 'accept' && id && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && mode === undefined) {
    if (!acceptHandoff(db, Number(id))) throw new Error('handoff is not awaiting acceptance')
    console.log(`handoff ${id} accepted`)
    return
  }
  if (action === 'mode' && id && rest.length === 0 && (mode === undefined || mode === 'auto' || mode === 'manual')) {
    if (mode && !setHandoffMode(db, id, mode === 'auto')) throw new Error('task not found')
    const automatic = handoffMode(db, id)
    if (automatic === undefined) throw new Error('task not found')
    console.log(automatic ? 'auto' : 'manual')
    return
  }
  throw new Error('usage: taskq handoff accept ID | mode TASK [auto|manual]')
}
