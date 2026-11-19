import { z } from 'zod'
import { getMeta, setMeta } from '../db/meta.ts'
import { getMemory, MEMORY_LIMIT, setMemory } from './memory.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

export function memoryTools(scope: ScopedTools): TeamTool[] {
  const { db, agent, wrote } = scope
  return [
    {
      name: 'memory_write',
      description: `Replace or append to your own memory, which is sent with every turn you take. Keep it short (at most ${MEMORY_LIMIT} characters): what you learned about the user's preferences, the repositories you work in, and mistakes to avoid. Facts the whole team needs go in the wiki instead.`,
      input: { text: z.string().max(MEMORY_LIMIT), mode: z.enum(['replace', 'append']) },
      readOnly: false,
      handler(args) {
        const next = args.mode === 'append' ? `${getMemory(db, agent)}\n${String(args.text)}`.trim() : String(args.text)
        const error = setMemory(db, agent, next)
        if (error) throw new ToolError(error)
        wrote()
        return { characters: next.length }
      },
    },
    {
      // 7,500 characters: the note is delivered inside one message, which holds 8,000.
      // send_message cannot carry the note: a message to yourself needs a 10 minute delay (the loop guard).
      name: 'write_handover',
      description: 'Only when taskq told you this conversation is ending: save the note your next conversation starts from (work in progress and its next step, what the user is waiting on, decisions and why, files and task ids). Calling it again replaces the note.',
      input: { text: z.string().min(1).max(7500) },
      readOnly: false,
      handler(args) {
        if (getMeta(db, `team_handover:${agent}`) === null) throw new ToolError('taskq did not ask for a handover; use memory_write or the wiki for notes')
        setMeta(db, `team_handover_note:${agent}`, String(args.text))
        return { saved: true }
      },
    },
  ]
}
