// Two sections of the global settings: Usage (tokens and cost per SDK and per bot session, Claude, OpenAI and Kiro
// side by side) and Kiro sign-in (AWS IAM Identity Center device flow). Both load when the settings dialog opens.
import { api, mutate, notify } from '../core/api.js'
import { area, el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { botAvatar } from './avatar.js'

const SDK_NAME = { claude: 'Claude', openai: 'OpenAI', kiro: 'Kiro' }
const PROVIDER_NAME = { api: 'API key', bedrock: 'Bedrock', chatgpt: 'ChatGPT plan' }
let period = '7d'

export function initUsageSettings() {
  area('settings-button').addEventListener('click', () => {
    loadUsage()
    loadKiro()
  })
  area('usage-period').addEventListener('change', (event) => {
    period = event.target.value
    loadUsage()
  })
  area('kiro-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const f = event.currentTarget.elements
    const state = await mutate(() => api.post('/kiro/login', { start_url: f.start_url.value.trim(), region: f.region.value.trim() }))
    if (state) renderLogin(state)
  })
  area('kiro-check').addEventListener('click', loadKiro)
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

function renderLogin(state) {
  const box = area('kiro-login')
  if (!state) return fill(box)
  fill(box,
    state.url ? el('p', {}, t('kiro.open', 'Open'), ' ', el('a', { href: state.url, target: '_blank', rel: 'noopener', text: state.url }), ' ', t('kiro.enter', 'and enter the code'), ' ',
      el('strong', { class: 'mono', text: state.code ?? '?' })) : null,
    !state.url ? el('pre', { class: 'meta', text: state.output || t('kiro.waiting', 'Waiting for kiro-cli…') }) : null,
    el('p', { class: 'meta', text: state.running ? t('kiro.pending', 'Waiting for you to approve in the browser. Check the status afterwards.') : `kiro-cli login ended (${state.exit ?? '?'})` }))
}

async function loadKiro() {
  try {
    const status = await api.get('/kiro/status')
    const f = area('kiro-form').elements
    if (!f.start_url.value) f.start_url.value = status.sso.start_url
    if (!f.region.value) f.region.value = status.sso.region
    fill(area('kiro-status'), el('span', { class: 'wf-status', dataset: { status: status.whoami.signed_in ? 'succeeded' : 'failed' }, text: status.whoami.signed_in ? t('kiro.signed_in', 'Signed in') : t('kiro.signed_out', 'Not signed in') }),
      el('span', { class: 'meta', text: ` ${status.whoami.text}` }))
    renderLogin(status.login)
  } catch (error) {
    notify(error.message, true)
  }
}
