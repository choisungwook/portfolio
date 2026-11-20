// The Connections page of Settings, plus the connection data the bot list (status dots) and a bot's conversation (why it
// may not answer) use: how each bot reaches its model and whether that works.
import { api, mutate } from '../core/api.js'
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
    // A rerun can turn a bot back on and resume the bots; the bot list and the open conversation read it now.
    if (refresh) {
      emit('bots-changed')
      emit('connections-changed')
    }
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

// The sign-in form: Claude's provider, region and AWS profile, and the AWS profile OpenAI-on-Bedrock bots use. The
// profile fields suggest the profiles found in ~/.aws.
async function loadSignIn() {
  const form = area('conn-settings-form')
  try {
    const [settings, profiles] = await Promise.all([api.get('/connection-settings'), api.get('/aws/profiles')])
    for (const [name, value] of Object.entries(settings)) if (form.elements[name]) form.elements[name].value = value ?? ''
    // The key is never sent back; an empty field keeps the saved one.
    form.elements.claude_api_key.value = ''
    form.elements.claude_api_key.placeholder = settings.claude_api_key_set
      ? t('connections.key_saved', 'Saved. Leave empty to keep it')
      : t('connections.key_env', 'Empty: ANTHROPIC_API_KEY from the environment')
    fill(area('aws-profile-list'), ...profiles.map((p) => el('option', { value: p.name, label: `${p.name} (${p.kind}${p.region ? `, ${p.region}` : ''})` })))
    area('aws-profile-note').textContent = profiles.length
      ? `${t('connections.profiles', 'Profiles on this machine')}: ${profiles.map((p) => `${p.name} (${p.kind})`).join(', ')}`
      : t('connections.no_profiles', 'No AWS profiles found in ~/.aws/config.')
    showClaudeFields()
  } catch (error) {
    area('aws-profile-note').textContent = error.message
  }
}

function showClaudeFields() {
  const provider = area('conn-settings-form').elements.claude_provider.value
  const bedrock = provider === 'bedrock'
  area('conn-claude-key').hidden = provider !== 'api_key'
  area('conn-claude-aws').hidden = !bedrock
  area('conn-claude-region').hidden = !bedrock
}

export function initConnections() {
  on('settings-page', (page) => {
    if (page === 'connections') {
      loadConnections()
      loadSignIn()
    }
  })
  const form = area('conn-settings-form')
  form.elements.claude_provider.addEventListener('change', showClaudeFields)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(form).entries())
    if (await mutate(() => api.put('/connection-settings', body), t('connections.saved', 'Sign-in saved; it applies from the next turn'))) {
      loadConnections(true)
      loadSignIn()
    }
  })
  area('connections-refresh').addEventListener('click', () => loadConnections(true))
}
