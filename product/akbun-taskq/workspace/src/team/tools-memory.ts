import { z } from 'zod'
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
  ]
}
