// The Connections page of Settings, plus the connection data the bot list (status dots) and a bot's conversation (why it
// may not answer) use. The page has one section per agent type (Claude, OpenAI, Kiro): pick the sign-in method, fill
// what it needs, then Connection test, Save (which tests too) or Clear (back to taskq.config.json and the environment).
import { api, mutate } from '../core/api.js'
import { emit, on } from '../core/bus.js'
import { area, el, fill } from '../core/dom.js'
import { icon } from '../core/icons.js'
import { t } from '../core/i18n.js'

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

const forms = () => [...document.querySelectorAll('.conn-runtime')]
const method = (form) => form.querySelector('[data-method]').value
// The connection a section tests: Claude names its methods api_key/subscription/bedrock, the connections api/....
const connectionId = (form) => {
  const runtime = form.dataset.runtime
  if (runtime === 'kiro') return 'kiro'
  const m = method(form)
  return `${runtime}:${runtime === 'claude' && m === 'api_key' ? 'api' : m}`
}

function showFields(form) {
  const m = method(form)
  for (const node of form.querySelectorAll('[data-for]')) node.hidden = node.dataset.for !== m
}

function result(form, state) {
  const box = form.querySelector('[data-result]')
  if (!state) return fill(box)
  if (state === 'busy') return fill(box, el('span', { class: 'meta', text: t('connections.testing', 'Testing…') }))
  const ok = state.status === 'ok'
  fill(box, el('span', { class: 'conn-icon', dataset: { status: ok ? 'ok' : 'error' }, title: ok ? t('connections.ok', 'Connected') : t('connections.error', 'Failing') },
    icon(ok ? 'check' : 'close', 16)),
  el('span', { class: ok ? 'meta' : 'conn-error', text: ok ? t('connections.ok', 'Connected') : state.reason ?? '' }))
}

async function test(form) {
  result(form, 'busy')
  testing.add(form)
  const id = connectionId(form)
  try {
    known[id] = await api.post('/connections/test', { id })
    result(form, known[id])
    // A pass can turn a bot back on; the bot list and the open conversation read it now.
    emit('bots-changed')
    emit('connections-changed')
  } catch (error) {
    known[id] = { status: 'error', reason: error.message }
    result(form, known[id])
  } finally {
    testing.delete(form)
  }
}

let keys = {}
// The last known status of every connection, from GET /connections (its checks are cached on the server for a minute)
// and from tests run here. Opening the page or switching a method shows it instead of a blank result.
let known = {}
const testing = new Set()

async function loadStatus() {
  try {
    const report = await api.get('/connections')
    for (const c of report.connections) known[c.id] ??= { status: c.status, reason: c.reason }
  } catch { /* the sections stay without a result */ }
  // A test started meanwhile keeps its "Testing…" until its own answer arrives.
  for (const form of forms()) if (!testing.has(form)) result(form, known[connectionId(form)] ?? null)
}

// Fills every section from what is saved. Keys are never sent back: an empty key field keeps the saved key. Returns
// false when it could not, after showing why in every section, so the status read does not paint over the error.
async function load() {
  try {
    const [settings, profiles, bots] = await Promise.all([api.get('/connection-settings'), api.get('/aws/profiles'), api.get('/bots').catch(() => ({ agents: [] }))])
    // OpenAI's method is not saved anywhere; start from the one an OpenAI bot uses, so the test checks what runs.
    const openai = document.querySelector('.conn-runtime[data-runtime="openai"]')
    if (!openai.dataset.loaded) settings.openai_method = bots.agents.find((a) => a.sdk === 'openai')?.provider ?? 'api'
    openai.dataset.loaded = 'true'
    for (const form of forms()) {
      for (const [name, value] of Object.entries(settings)) if (form.elements[name]) form.elements[name].value = value ?? ''
    }
    keys = { claude: settings.claude_api_key_set, openai: settings.openai_api_key_set }
    for (const [runtime, saved] of Object.entries(keys)) {
      const input = document.querySelector(`.conn-runtime[data-runtime="${runtime}"] input[type="password"]`)
      input.value = ''
      input.placeholder = saved ? t('connections.key_saved', 'Saved. Leave empty to keep it')
        : runtime === 'claude' ? t('connections.key_env', 'Empty: ANTHROPIC_API_KEY from the environment')
          : t('connections.key_env_openai', 'Empty: OPENAI_API_KEY from the environment')
    }
    fill(area('aws-profile-list'), ...profiles.map((p) => el('option', { value: p.name, label: `${p.name} (${p.kind}${p.region ? `, ${p.region}` : ''})` })))
    for (const form of forms()) showFields(form)
    return true
  } catch (error) {
    for (const form of forms()) result(form, { status: 'error', reason: error.message })
    return false
  }
}

// Only this section's fields are sent; the OpenAI and Kiro method selects choose what to fill, they are not saved.
function body(form) {
  const out = {}
  for (const input of form.querySelectorAll('input[name], select[name]')) {
    if (input.closest('[data-for]')?.hidden || input.name.endsWith('_method')) continue
    out[input.name] = input.value.trim()
  }
  return out
}

function renderLogin(state) {
  const box = area('kiro-login')
  if (!state) return fill(box)
  fill(box,
    state.url ? el('p', {}, t('kiro.open', 'Open'), ' ', el('a', { href: state.url, target: '_blank', rel: 'noopener', text: state.url }), ' ', t('kiro.enter', 'and enter the code'), ' ',
      el('strong', { class: 'mono', text: state.code ?? '?' })) : null,
    !state.url ? el('pre', { class: 'meta', text: state.output || t('kiro.waiting', 'Waiting for kiro-cli…') }) : null,
    el('p', { class: 'meta', text: state.running ? t('kiro.pending', 'Waiting for you to approve in the browser. Run the connection test afterwards.') : `kiro-cli login ended (${state.exit ?? '?'})` }))
}

export function initConnections() {
  on('settings-page', (page) => {
    if (page !== 'connections') return
    // The OpenAI method stays as picked (it is not saved anywhere); Claude shows its saved method. Each section shows
    // the current status of its method at once.
    known = {}
    load().then((ok) => ok && loadStatus())
  })
  for (const form of forms()) {
    form.querySelector('[data-method]').addEventListener('change', () => {
      showFields(form)
      result(form, known[connectionId(form)] ?? null)
    })
    form.querySelector('[data-test]').addEventListener('click', () => test(form))
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (await mutate(() => api.put('/connection-settings', body(form)), t('connections.saved', 'Saved; it applies from the next turn'))) {
        await load()
        test(form)
      }
    })
    form.querySelector('[data-clear]').addEventListener('click', async () => {
      if (await mutate(() => api.del(`/connection-settings/${form.dataset.runtime}`), t('connections.cleared', 'Cleared'))) {
        known = {}
        result(form, null)
        load().then((ok) => ok && loadStatus())
      }
    })
  }
  area('kiro-sign-in').addEventListener('click', async () => {
    const f = area('kiro-sign-in').form.elements
    const state = await mutate(() => api.post('/kiro/login', { start_url: f.kiro_start_url.value.trim(), region: f.kiro_region.value.trim() }))
    if (state) renderLogin(state)
  })
}
