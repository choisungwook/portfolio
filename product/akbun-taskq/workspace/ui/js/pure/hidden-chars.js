// Finds code points a reader cannot see and splits text into parts for display. Pure: no DOM, so node can run it.
// Marked: control characters (except newline), format characters (zero-width, bidi controls), other separators,
// space characters other than U+0020, fillers that look blank, private-use, unassigned and lone surrogates.
// Each marked code point becomes an escape such as \u{202E}.
const HIDDEN = /^(?:\p{Cc}|\p{Cf}|\p{Co}|\p{Cn}|\p{Cs}|\p{Zs}|\p{Zl}|\p{Zp}|[ᅟᅠㅤﾠ])$/u

export function isHidden(ch) {
  return ch !== '\n' && ch !== ' ' && HIDDEN.test(ch)
}

export function escapeChar(ch) {
  const hex = ch.codePointAt(0).toString(16).replace(/[a-f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32))
  return `\\u{${hex}}`
}

// [{ text, hidden }] in order. Adjacent parts of the same kind merge. Hidden parts hold escapes, never raw characters.
export function visibleParts(text) {
  const parts = []
  for (const ch of String(text)) {
    const hidden = isHidden(ch)
    const piece = hidden ? escapeChar(ch) : ch
    const last = parts.at(-1)
    if (last && last.hidden === hidden) last.text += piece
    else parts.push({ text: piece, hidden })
  }
  return parts
}

// Number of non-printing code points in the text.
export function hiddenCount(text) {
  let n = 0
  for (const ch of String(text)) {
    if (isHidden(ch)) n += 1
  }
  return n
}
