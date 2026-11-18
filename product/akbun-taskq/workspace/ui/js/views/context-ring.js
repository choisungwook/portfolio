// How full a bot's context is, as a ring like the one next to Claude Desktop's input: the share of the model's context
// window its last turn ended with. Grey when the size is not known yet. A window of 100 is a runtime that reports only a
// percentage (Kiro), so the label has no token counts.
import { t } from '../core/i18n.js'

const SVG = 'http://www.w3.org/2000/svg'

export function contextRing(agent, size = 22) {
  const known = agent?.context_tokens !== null && agent?.context_tokens !== undefined && agent?.context_window
  const share = known ? Math.min(1, agent.context_tokens / agent.context_window) : 0
  const level = !known ? 'none' : share >= 0.85 ? 'high' : share >= 0.6 ? 'mid' : 'low'
  const r = size / 2 - 2.5
  const length = 2 * Math.PI * r
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('class', 'context-ring')
  svg.dataset.level = level
  const percentOnly = agent?.context_window === 100
  const label = !known ? t('ctx.unknown', 'Context size not known yet')
    : percentOnly ? `${t('ctx.context', 'Context')} ${Math.round(share * 100)}%`
      : `${t('ctx.context', 'Context')} ${Math.round(share * 100)}% · ${Math.round(agent.context_tokens / 1000)}k / ${Math.round(agent.context_window / 1000)}k`
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  const title = document.createElementNS(SVG, 'title')
  title.textContent = label
  const track = document.createElementNS(SVG, 'circle')
  const bar = document.createElementNS(SVG, 'circle')
  for (const c of [track, bar]) {
    c.setAttribute('cx', String(size / 2))
    c.setAttribute('cy', String(size / 2))
    c.setAttribute('r', String(r))
  }
  track.setAttribute('class', 'context-track')
  bar.setAttribute('class', 'context-bar')
  bar.setAttribute('stroke-dasharray', `${length * share} ${length}`)
  bar.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`)
  svg.append(title, track, bar)
  return svg
}

export function contextLabel(agent) {
  if (!agent?.context_window || agent.context_tokens === null || agent.context_tokens === undefined) return ''
  return `${Math.round((agent.context_tokens / agent.context_window) * 100)}%`
}
