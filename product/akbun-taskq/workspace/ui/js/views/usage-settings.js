// The Usage page of the global settings: tokens and cost per SDK and per bot session, Claude, OpenAI and Kiro side by side.
import { api } from '../core/api.js'
import { on } from '../core/bus.js'
import { area, el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { botAvatar } from './avatar.js'

const SDK_NAME = { claude: 'Claude', openai: 'OpenAI', kiro: 'Kiro' }
const PROVIDER_NAME = { api: 'API key', bedrock: 'Bedrock', chatgpt: 'ChatGPT plan' }
let period = '7d'

export function initUsageSettings() {
  on('settings-page', (page) => {
    if (page === 'usage') loadUsage()
  })
  area('usage-period').addEventListener('change', (event) => {
    period = event.target.value
    loadUsage()
  })
}

const tokens = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0))
const money = (row) => (row.sdk === 'kiro' ? (row.credits === null || row.credits === undefined ? '—' : `${Number(row.credits).toFixed(2)} cr`)
  : row.sdk === 'openai' && row.provider === 'chatgpt' ? t('usage.plan', 'plan') : `$${Number(row.cost_usd).toFixed(2)}`)
const sdkLabel = (row) => `${SDK_NAME[row.sdk] ?? row.sdk}${row.provider ? ` · ${PROVIDER_NAME[row.provider] ?? row.provider}` : ''}`

async function loadUsage() {
  const box = area('usage-report')
  let report
  try {
    report = await api.get(`/usage?period=${period}`)
  } catch (error) {
    fill(box, el('p', { class: 'error', text: error.message }))
    return
  }
  const head = (...cells) => el('tr', {}, ...cells.map((c) => el('th', { text: c })))
  const runs = report.task_runs
  fill(box,
    el('div', { class: 'usage-cards' },
      ...report.by_sdk.map((row) => el('div', { class: 'usage-card', dataset: { sdk: row.sdk } },
        el('strong', { text: sdkLabel(row) }),
        el('span', { class: 'usage-money', text: money(row) }),
        el('span', { class: 'meta', text: `${row.turns} turns · in ${tokens(row.input_tokens)} · out ${tokens(row.output_tokens)}${row.cache_read_tokens ? ` · cache ${tokens(row.cache_read_tokens)}` : ''}` }))),
      el('div', { class: 'usage-card', dataset: { sdk: 'claude' } },
        el('strong', { text: t('usage.task_runs', 'Task runs (Claude)') }),
        el('span', { class: 'usage-money', text: `$${Number(runs.cost_usd ?? 0).toFixed(2)}` }),
        el('span', { class: 'meta', text: `${runs.runs} runs · in ${tokens(runs.input_tokens)} · out ${tokens(runs.output_tokens)}` })),
    ),
    report.by_session.length === 0 ? el('p', { class: 'meta', text: t('usage.none', 'No bot turns in this period.') }) : el('table', { class: 'usage-table' },
      el('thead', {}, head(t('usage.bot', 'Bot'), 'SDK', t('usage.model', 'Model'), t('usage.session', 'Session'), t('usage.turns', 'Turns'), t('usage.in', 'In'), t('usage.out', 'Out'), t('usage.cost', 'Cost'), t('usage.last', 'Last'))),
      el('tbody', {}, ...report.by_session.map((row) => el('tr', {},
        el('td', { class: 'usage-bot' }, el('span', {}, botAvatar(row.bot, 20, row.sdk), el('span', { text: row.bot }))),
        el('td', { text: sdkLabel(row) }),
        el('td', { class: 'mono', text: row.model ?? '—' }),
        el('td', { class: 'mono', title: row.session_id ?? '', text: row.session_id ? String(row.session_id).slice(0, 10) : '—' }),
        el('td', { text: String(row.turns) }),
        el('td', { text: tokens(row.input_tokens) }),
        el('td', { text: tokens(row.output_tokens) }),
        el('td', { text: money(row) }),
        el('td', { text: fmtDateTime(row.last_at) }))))),
  )
}
