// The Connections page of Settings and the connection panel on a bot's page: how each bot reaches its model, whether
// that works, and why a bot is not answering.
import { api } from '../core/api.js'
import { emit, on } from '../core/bus.js'
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
    last && last.outcome !== 'done'
      ? el('span', { class: 'conn-error', text: ` · ${t('connections.last', 'Last turn')} (${last.agent ?? ''} ${last.outcome}, ${fmtDateTime(last.at)}): ${last.error ?? ''}` })
      : null)
}

// A warning when no bot can answer at all: bots off in the config, or paused.
export function teamBanner(team) {
  if (!team.enabled) return el('p', { class: 'conn-banner', role: 'alert', text: t('connections.off', 'Bots are off. Set bots.enabled to true in taskq.config.json and restart taskq; while off, no bot answers.') })
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

// The panel on the right of a bot's conversation. Returns what it showed, so the conversation can say the bot will not
// answer.
export async function renderBotConnection(box, name, refresh = false) {
  try {
    const info = await api.get(`/bots/${name}/connection${refresh ? '?refresh=1' : ''}`)
    const c = info.connection
    fill(box,
      el('h3', { text: t('connections.title', 'Connection') }),
      el('div', { class: 'conn-head' }, el('strong', { text: c.label }), statusBadge(c.status)),
      el('p', { class: 'meta mono', text: c.detail }),
      c.reason ? el('p', { class: 'conn-error', text: c.reason }) : null,
      info.blocker
        ? el('div', { class: 'conn-why', role: 'alert' }, el('strong', { text: t('connections.why', 'Why it is not answering') }), el('p', { text: info.blocker }))
        : el('p', { class: 'conn-ok', text: t('connections.answering', 'Can answer') }),
      info.waiting ? el('p', { class: 'meta', text: `${t('connections.waiting', 'Waiting messages')}: ${info.waiting}` }) : null,
      el('p', { class: 'meta' }, `${t('connections.last', 'Last turn')}: `,
        info.last_turn ? `${info.last_turn.outcome}, ${fmtDateTime(info.last_turn.at)}` : t('connections.never', 'never')),
      el('p', { class: 'meta', text: `${t('connections.used_by', 'Used by')}: ${c.bots.join(', ')}` }),
      el('div', { class: 'conn-actions' },
        el('button', { type: 'button', text: t('connections.check', 'Check again'), onclick: () => renderBotConnection(box, name, true) }),
        el('button', { type: 'button', class: 'quiet', text: t('connections.open', 'Connection settings'), onclick: () => emit('open-settings', 'connections') })))
    return info
  } catch (error) {
    fill(box, el('p', { class: 'error', text: error.message }))
    return null
  }
}

export function initConnections() {
  on('settings-page', (page) => {
    if (page === 'connections') loadConnections()
  })
  area('connections-refresh').addEventListener('click', () => loadConnections(true))
}
