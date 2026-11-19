// The Connections page of Settings, plus the connection data the bot list (status dots) and a bot's conversation (why it
// may not answer) use: how each bot reaches its model and whether that works.
import { api } from '../core/api.js'
import { on } from '../core/bus.js'
import { area, el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'

const when = (sec) => (sec ? fmtDateTime(sec) : t('connections.never', 'never'))

function statusBadge(status) {
  return el('span', {
    class: 'wf-status', dataset: { status: status === 'ok' ? 'succeeded' : 'failed' },
    text: status === 'ok' ? t('connections.ok', 'Connected') : t('connections.error', 'Failing'),
  })
}

function lastLine(last, lastOk) {
  return el('p', { class: 'meta' },
    `${t('connections.last_ok', 'Last answer')}: ${when(lastOk)}`,
    last?.outcome === 'failed'
      ? el('span', { class: 'conn-error', text: ` · ${t('connections.last', 'Last turn')} (${last.agent ?? ''} ${last.outcome}, ${fmtDateTime(last.at)}): ${last.error ?? ''}` })
      : null)
}

// A warning when no bot can answer at all: the bots are paused.
export function teamBanner(team) {
  if (team.paused) return el('p', { class: 'conn-banner', role: 'alert', text: `${t('connections.paused', 'Bots are paused')}: ${team.pause_reason ?? ''}` })
  return null
}

function card(connection) {
  return el('article', { class: 'conn-card', dataset: { status: connection.status, used: String(connection.bots.length > 0) } },
    el('div', { class: 'conn-head' }, el('strong', { text: connection.label }), statusBadge(connection.status)),
    el('p', { class: 'meta mono', text: connection.detail }),
    connection.reason ? el('p', { class: 'conn-error', text: connection.reason }) : null,
    el('p', { class: 'meta' }, `${t('connections.used_by', 'Used by')}: `,
      connection.bots.length ? el('strong', { text: connection.bots.join(', ') }) : t('connections.unused', 'no bot')),
    lastLine(connection.last, connection.last_ok_at),
    el('p', { class: 'meta', text: `${t('connections.checked', 'Checked')} ${fmtDateTime(connection.checked_at)}` }))
}

async function loadConnections(refresh = false) {
  const box = area('connections-report')
  fill(box, el('p', { class: 'meta', text: '…' }))
  try {
    const report = await api.get(`/connections${refresh ? '?refresh=1' : ''}`)
    // Connections a bot uses come first.
    const sorted = [...report.connections].sort((a, b) => Number(b.bots.length > 0) - Number(a.bots.length > 0))
    fill(box, teamBanner(report.team), el('div', { class: 'conn-cards' }, ...sorted.map(card)))
  } catch (error) {
    fill(box, el('p', { class: 'error', text: error.message }))
  }
}

// One bot's connection and why it may not answer, for the conversation's "will not answer yet" note.
export async function botConnection(name) {
  try {
    return await api.get(`/bots/${encodeURIComponent(name)}/connection`)
  } catch {
    return null
  }
}

// Each bot's connection status, for the dots in the bot list: { bot: { status, label, reason } }.
export async function connectionByBot() {
  const report = await api.get('/connections')
  const out = {}
  for (const c of report.connections) for (const bot of c.bots) out[bot] = { status: c.status, label: c.label, reason: c.reason }
  return out
}

export function initConnections() {
  on('settings-page', (page) => {
    if (page === 'connections') loadConnections()
  })
  area('connections-refresh').addEventListener('click', () => loadConnections(true))
}
