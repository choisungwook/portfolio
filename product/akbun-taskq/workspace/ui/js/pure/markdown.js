// A small Markdown reader for previewing .md files. Pure: it returns a tree of plain objects, never HTML, so the view
// builds DOM nodes with textContent and no file can inject markup or script. It covers what bots write: headings,
// paragraphs, lists (one level of nesting is flattened), fenced code, block quotes, tables, rules, and inline code,
// bold, italic and links (http, https and mailto only).

// Inline: [{ t: 'text'|'code'|'strong'|'em'|'link', text, href? }]
export function inline(text) {
  const out = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ t: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] })
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: 'strong', text: m[2] ?? m[3] })
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ t: 'em', text: m[4] ?? m[5] })
    else out.push(/^(https?:|mailto:)/i.test(m[7]) ? { t: 'link', text: m[6], href: m[7] } : { t: 'text', text: m[6] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', text: text.slice(last) })
  return out
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

// Blocks: [{ t: 'h', level, inline } | { t: 'p', inline } | { t: 'ul'|'ol', items: [inline] } | { t: 'code', text, lang }
//          | { t: 'quote', inline } | { t: 'table', head: [inline], rows: [[inline]] } | { t: 'hr' }]
export function parse(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line)
    if (fence) {
      const body = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i += 1
      blocks.push({ t: 'code', text: body.join('\n'), lang: fence[2] })
      continue
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      blocks.push({ t: 'h', level: heading[1].length, inline: inline(heading[2]) })
      i += 1
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ t: 'hr' })
      i += 1
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line).map(inline)
      const rows = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]).map(inline))
      blocks.push({ t: 'table', head, rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ t: 'quote', inline: inline(body.join(' ')) })
      continue
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+/.exec(line)
    if (bullet) {
      const ordered = /\d/.test(bullet[1])
      const items = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '')))
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++].trim())
    blocks.push({ t: 'p', inline: inline(para.join(' ')) })
  }
  return blocks
}
