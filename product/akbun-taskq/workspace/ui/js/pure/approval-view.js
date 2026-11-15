// What the approval panel and the must-check list show for a pending request. Pure: no DOM, so node can run it.
import { hiddenCount } from './hidden-chars.js'

export const READ_CHARS = 600
export const READ_LINES = 8

// The Bash command on its own (null for other tools), and the whole input as pretty JSON.
export function approvalText(tool, input) {
  const command = tool === 'Bash' && typeof input?.command === 'string' ? input.command : null
  return { command, json: JSON.stringify(input, null, 2) ?? 'null' }
}

// Long text must be read to its end before Approve is enabled.
export function isLong(text) {
  return text.length > READ_CHARS || text.split('\n').length > READ_LINES
}

// Non-printing code points in every string value of the input.
export function hiddenInInput(value) {
  if (typeof value === 'string') return hiddenCount(value)
  if (Array.isArray(value)) return value.reduce((n, v) => n + hiddenInInput(v), 0)
  if (value !== null && typeof value === 'object') return Object.values(value).reduce((n, v) => n + hiddenInInput(v), 0)
  return 0
}

// The first n characters by code point, with an ellipsis when cut.
export function headOf(text, n = 120) {
  const chars = Array.from(text)
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : text
}
