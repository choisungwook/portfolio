// Top-level `key: value` lines between the first two `---` lines. Nested and multi-line values are not read.
export function readFrontmatter(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return {}
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end < 0) return {}
  const out: Record<string, string> = Object.create(null)
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line)
    if (match) out[match[1]] = unquote((match[2] ?? '').trim())
  }
  return out
}

function unquote(value: string): string {
  const quote = value[0]
  return value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value
}
