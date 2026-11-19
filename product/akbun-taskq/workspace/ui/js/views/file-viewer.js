// A file from the shared folder, shown in a side pane: HTML in a sandboxed frame, Markdown rendered, images and text
// shown as they are; anything else (slides, documents, archives) gets "Open" (its app on this machine) and "Show in
// shared folder". Used by a bot conversation and by the shared folder view.
//
// HTML runs in an iframe with sandbox="allow-scripts" and no allow-same-origin, served by /preview with a sandbox policy:
// the page gets an opaque origin, so its scripts cannot read taskq's token or call the API. Markdown is built from the parsed tree with textContent only.
import { api, mutate, notify } from '../core/api.js'
import { emit } from '../core/bus.js'
import { el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { parse } from '../pure/markdown.js'

const PREVIEW_LIMIT = 5 * 1024 * 1024
const KINDS = {
  html: ['html', 'htm'],
  markdown: ['md', 'markdown'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  text: ['txt', 'log', 'json', 'csv', 'tsv', 'yaml', 'yml', 'toml', 'xml', 'ts', 'js', 'mjs', 'py', 'sh', 'go', 'rs', 'java', 'sql', 'css', 'tf', 'ini', 'conf', 'env', 'diff', 'patch'],
}

export function extOf(path) {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function kindOf(path) {
  const ext = extOf(path)
  return Object.entries(KINDS).find(([, exts]) => exts.includes(ext))?.[0] ?? 'other'
}

function inlineNodes(parts) {
  return parts.map((part) => {
    if (part.t === 'code') return el('code', { text: part.text })
    if (part.t === 'strong') return el('strong', { text: part.text })
    if (part.t === 'em') return el('em', { text: part.text })
    if (part.t === 'link') return el('a', { href: part.href, text: part.text, target: '_blank', rel: 'noopener noreferrer' })
    return document.createTextNode(part.text)
  })
}

function markdownNodes(source) {
  return parse(source).map((block) => {
    switch (block.t) {
      case 'h': return el(`h${Math.min(6, block.level + 1)}`, {}, ...inlineNodes(block.inline))
      case 'ul':
      case 'ol': return el(block.t, {}, ...block.items.map((item) => el('li', {}, ...inlineNodes(item))))
      case 'code': return el('pre', {}, el('code', { text: block.text }))
      case 'quote': return el('blockquote', {}, ...inlineNodes(block.inline))
      case 'hr': return el('hr')
      case 'table': return el('table', {},
        el('thead', {}, el('tr', {}, ...block.head.map((cell) => el('th', {}, ...inlineNodes(cell))))),
        el('tbody', {}, ...block.rows.map((row) => el('tr', {}, ...row.map((cell) => el('td', {}, ...inlineNodes(cell)))))))
      default: return el('p', {}, ...inlineNodes(block.inline))
    }
  })
}

// Shows `path` (relative to the shared folder) in `box`. onClose hides the pane.
export async function showFile(box, path, { onClose } = {}) {
  const name = path.split('/').pop()
  const dir = path.split('/').slice(0, -1).join('/')
  const kind = kindOf(path)
  const actions = el('div', { class: 'file-actions' },
    el('button', { type: 'button', text: t('file.open', 'Open'), title: t('file.open_hint', 'Open with its app on this computer'), onclick: () => mutate(() => api.post('/open-file', { path })) }),
    el('button', { type: 'button', class: 'quiet', text: t('file.in_shared', 'Show in shared folder'), onclick: () => emit('open-shared', { dir, select: path }) }),
    el('button', { type: 'button', class: 'quiet', text: t('file.download', 'Download'), onclick: () => download(path) }),
    onClose ? el('button', { type: 'button', class: 'quiet file-close', 'aria-label': t('file.close', 'Close'), text: '×', onclick: onClose } ) : null)
  const head = el('div', { class: 'file-head' }, el('strong', { class: 'file-name', title: path, text: name }), actions)
  const body = el('div', { class: 'file-body', dataset: { kind } }, el('p', { class: 'meta', text: '…' }))
  fill(box, head, body)
  box.hidden = false
  if (kind === 'other') {
    fill(body, el('p', { class: 'meta', text: t('file.no_preview', 'This kind of file has no preview here. Open it with its app, or find it in the shared folder.') }))
    return
  }
  try {
    // HTML loads from a short-lived preview URL with its own sandbox policy (see src/api/preview.ts).
    if (kind === 'html') {
      const { url } = await api.post('/shared/preview', { path })
      fill(body, el('iframe', { class: 'file-frame', sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', title: name, src: url }))
      return
    }
    const blob = await api.blob(`/shared/file?path=${encodeURIComponent(path)}`)
    if (blob.size > PREVIEW_LIMIT) {
      fill(body, el('p', { class: 'meta', text: t('file.too_big', 'Too large to preview. Open it with its app.') }))
      return
    }
    if (kind === 'image') {
      const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: extOf(path) === 'svg' ? 'image/svg+xml' : 'image/*' }))
      fill(body, el('img', { src: url, alt: name, onload: () => setTimeout(() => URL.revokeObjectURL(url), 1000) }))
      return
    }
    const text = await blob.text()
    if (kind === 'markdown') fill(body, el('article', { class: 'file-md' }, ...markdownNodes(text)))
    else fill(body, el('pre', { class: 'file-text', text }))
  } catch (error) {
    fill(body, el('p', { class: 'error', text: error.message }))
  }
}

// Downloads go through fetch, because the API needs the token header that a plain link cannot send.
export async function download(path) {
  try {
    const blob = await api.blob(`/shared/file?path=${encodeURIComponent(path)}`)
    const url = URL.createObjectURL(blob)
    const link = el('a', { href: url, download: path.split('/').pop() })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (error) {
    notify(error.message, true)
  }
}
