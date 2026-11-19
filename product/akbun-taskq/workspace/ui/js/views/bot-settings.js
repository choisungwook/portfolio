// The bot settings dialog: create a bot or edit one. Creating asks only for a name, a description and the SDK; everything
// else starts with defaults and is edited later. The gear on a bot and the right-click menu open it. Name is fixed after
// creation; taskq, the orchestrator, can be neither disabled nor deleted.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { show } from '../core/nav.js'

const MODES = [
  ['auto', 'Auto (default): Claude decides, risky calls are refused'],
  ['acceptEdits', 'Accept edits: file edits allowed, other calls refused'],
  ['default', 'Ask: calls that need approval are refused (nobody is there to ask)'],
  ['dontAsk', 'Only pre-approved tools'],
  ['plan', 'Plan only: no changes'],
  ['bypassPermissions', 'Bypass all permission checks'],
]

let dialog
let form
let editing = null

function lines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function init() {
  if (dialog) return
  dialog = area('bot-settings')
  form = area('bot-form')
  form.elements.sdk.addEventListener('change', () => showSdk(form.elements.permission_mode.value))
  form.elements.provider.addEventListener('change', () => showSdk(form.elements.permission_mode.value))
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', save)
  area('bot-session-folder').addEventListener('click', () => mutate(() => api.post('/open-folder', { target: 'bot', bot: editing })))
  const remove = area('bot-delete')
  remove.addEventListener('click', async () => {
    if (remove.dataset.confirm !== 'true') {
      remove.dataset.confirm = 'true'
      remove.textContent = `Delete ${editing}? Click again`
      return
    }
    if (await mutate(() => api.del(`/bots/${editing}`), `${editing} deleted; its open tasks are yours again`)) {
      dialog.close()
      show('calendar')
      emit('bots-changed')
    }
  })
}

function picks(target, kind, entries, chosen) {
  const box = area(target)
  if (entries.length === 0) {
    clear(box).append(el('p', { class: 'meta', text: `No ${kind === 'mcp' ? 'MCP server' : kind}s registered. Add them in the Plugins menu.` }))
    return
  }
  const title = { skill: 'Skills', plugin: 'Plugins (Claude only)', mcp: 'MCP servers' }[kind]
  clear(box).append(el('p', { class: 'pick-title', text: title }), ...entries.map((entry) => el('label', { class: 'check' },
    el('input', { type: 'checkbox', name: kind, value: entry.name, checked: chosen.includes(entry.name) || null }),
    ` ${entry.name}`, entry.ok === false ? el('span', { class: 'meta', text: ' (missing)' }) : null)))
}

// name null creates a bot.
export async function openBotSettings(name) {
  init()
  editing = name
  const remove = area('bot-delete')
  remove.dataset.confirm = 'false'
  remove.textContent = 'Delete bot'
  area('bot-form-error').textContent = ''
  try {
    const [settings, bot] = await Promise.all([api.get('/settings'), name ? api.get(`/bots/${name}`) : null])
    const value = bot ?? { role: 'custom', description: '', instructions: '', model: null, workdir: null, permission_mode: 'auto',
      sandbox: false, allowed_domains: [], blocked_commands: [], skills: [], plugins: [], enabled: true, may_message_user: false,
      hourly_turns: null, turn_budget_usd: null, turn_max_turns: null }
    area('bot-settings-title').textContent = name ? `${name} settings` : 'New bot'
    area('bot-name-row').hidden = Boolean(name)
    for (const node of form.querySelectorAll('[data-edit-only]')) node.hidden = !name
    for (const node of form.querySelectorAll('[data-create-only]')) node.hidden = Boolean(name)
    area('bot-save').textContent = name ? 'Save' : 'Create'
    const f = form.elements
    f.name.value = ''
    f.role.value = value.role
    f.model.value = value.model ?? ''
    f.description.value = value.description
    f.instructions.value = value.instructions
    f.workdir.value = value.workdir ?? ''
    f.sdk.value = value.sdk ?? 'claude'
    f.provider.value = value.provider ?? 'api'
    showSdk(value.permission_mode)
    f.sandbox.checked = value.sandbox
    f.allowed_domains.value = value.allowed_domains.join('\n')
    f.blocked_commands.value = value.blocked_commands.join('\n')
    f.enabled.checked = value.enabled
    f.enabled.disabled = Boolean(bot?.system)
    f.may_message_user.checked = value.may_message_user
    f.hourly_turns.value = value.hourly_turns ?? ''
    f.turn_budget_usd.value = value.turn_budget_usd ?? ''
    f.turn_max_turns.value = value.turn_max_turns ?? ''
    f.charter_owns.value = value.charter_owns ?? ''
    f.charter_good.value = value.charter_good ?? ''
    f.charter_never.value = value.charter_never ?? ''
    f.ask_first.value = (value.ask_first ?? []).join('\n')
    if (name) renderRoutines(name)
    area('bot-session-folder').hidden = !name
    remove.hidden = !name || Boolean(bot?.system)
    picks('bot-skills', 'skill', settings.bot_skills, value.skills)
    picks('bot-plugins', 'plugin', settings.bot_plugins, value.plugins)
    picks('bot-mcp', 'mcp', settings.bot_mcp_servers ?? [], value.mcp_servers ?? [])
    dialog.showModal()
    ;(name ? f.description : f.name).focus()
  } catch (error) {
    notify(error.message, true)
  }
}

async function save(event) {
  event.preventDefault()
  const f = form.elements
  const checked = (kind) => [...form.querySelectorAll(`input[name="${kind}"]:checked`)].map((input) => input.value)
  const body = {
    role: f.role.value, model: f.model.value, description: f.description.value, instructions: f.instructions.value,
    workdir: f.workdir.value, permission_mode: f.permission_mode.value, sandbox: f.sandbox.checked, sdk: f.sdk.value,
    provider: f.sdk.value === 'openai' ? f.provider.value : null,
    allowed_domains: lines(f.allowed_domains.value), blocked_commands: lines(f.blocked_commands.value),
    skills: checked('skill'), plugins: checked('plugin'), mcp_servers: checked('mcp'), enabled: f.enabled.checked, may_message_user: f.may_message_user.checked,
    hourly_turns: f.hourly_turns.value === '' ? null : Number(f.hourly_turns.value),
    turn_budget_usd: f.turn_budget_usd.value === '' ? null : Number(f.turn_budget_usd.value),
    turn_max_turns: f.turn_max_turns.value === '' ? null : Number(f.turn_max_turns.value),
    charter_owns: f.charter_owns.value, charter_good: f.charter_good.value, charter_never: f.charter_never.value,
    ask_first: lines(f.ask_first.value),
  }
  const error = area('bot-form-error')
  try {
    const saved = editing
      ? await api.put(`/bots/${editing}`, body)
      : await api.post('/bots', { ...body, name: f.name.value.trim() })
    dialog.close()
    emit('bots-changed')
    if (!editing) show('bot', saved.name)
  } catch (failure) {
    error.textContent = failure.message
  }
}

// The bot's routines, with a row to add one. The inputs have no name, so they are not part of the settings form.
async function renderRoutines(name) {
  const box = area('bot-routines')
  let routines = []
  try {
    routines = await api.get(`/routines?bot=${encodeURIComponent(name)}`)
  } catch (error) {
    clear(box).append(el('p', { class: 'error', text: error.message }))
    return
  }
  const when = (r) => r.schedule ?? `on ${r.trigger}`
  const next = (r) => (r.next_run_at ? ` · next ${new Date(r.next_run_at * 1000).toLocaleString()}` : '')
  const fields = {
    name: el('input', { type: 'text', maxlength: 100, placeholder: 'Morning brief', 'aria-label': 'Routine name' }),
    kind: el('select', { 'aria-label': 'When' }, ...[['schedule', 'On a schedule'], ['task_failed', 'When a task fails'], ['task_created', 'When a task is created'], ['webhook', 'When a webhook is called']]
      .map(([value, text]) => el('option', { value, text }))),
    schedule: el('input', { type: 'text', maxlength: 100, placeholder: '0 7 * * *', 'aria-label': 'Cron schedule', spellcheck: 'false' }),
    prompt: el('textarea', { rows: 2, maxlength: 4000, placeholder: 'Summarise yesterday\'s failed tasks and what to do about each', 'aria-label': 'What to do' }),
  }
  fields.kind.addEventListener('change', () => { fields.schedule.hidden = fields.kind.value !== 'schedule' })
  const add = async () => {
    const schedule = fields.kind.value === 'schedule'
    const made = await mutate(() => api.post('/routines', {
      bot: name, name: fields.name.value, prompt: fields.prompt.value,
      ...(schedule ? { schedule: fields.schedule.value } : { trigger: fields.kind.value }),
    }), 'Routine added')
    if (made) renderRoutines(name)
  }
  clear(box).append(
    routines.length === 0 ? el('p', { class: 'meta', text: 'No routines yet.' }) : el('ul', { class: 'routine-list' }, ...routines.map((r) => el('li', {},
      el('label', { class: 'check' }, el('input', {
        type: 'checkbox', checked: r.enabled || null, 'aria-label': `${r.name} on`,
        onchange: (event) => mutate(() => api.post(`/routines/${r.id}`, { enabled: event.target.checked })),
      }), ` ${r.name}`),
      el('span', { class: 'meta mono', text: ` ${when(r)}${next(r)}${r.trigger === 'webhook' ? ` · POST /api/routines/${r.id}/fire` : ''}` }),
      el('p', { class: 'meta', text: r.prompt }),
      el('button', { type: 'button', class: 'quiet', text: 'Delete', onclick: async () => { if (await mutate(() => api.del(`/routines/${r.id}`), 'Routine deleted')) renderRoutines(name) } })))),
    el('div', { class: 'routine-add' }, fields.name, fields.kind, fields.schedule, fields.prompt, el('button', { type: 'button', text: 'Add routine', onclick: add })),
  )
}

// The permission modes the bot's SDK has. OpenAI has no auto mode, so a Claude bot switched to OpenAI moves to accept edits.
const NO_AUTO_MODES = ['plan', 'acceptEdits', 'bypassPermissions']
const HINTS = {
  api: 'OpenAI Agents SDK with OPENAI_API_KEY. No auto mode: plan reads files, accept edits also writes in its folder and the shared folder, bypass also runs shell commands.',
  bedrock: 'OpenAI open-weight models (gpt-oss) on Amazon Bedrock. It signs in with the AWS profile chosen in Settings > Connections (an SSO profile works), or a Bedrock API key in AWS_BEARER_TOKEN_BEDROCK. Same tools as the API key bot.',
  chatgpt: 'Your ChatGPT plan through the Codex CLI: install codex and run codex login (Sign in with ChatGPT). Plan is a read-only sandbox, accept edits writes its folders, bypass has full access. No per-turn cost.',
  kiro: 'Kiro headless with your AWS IAM Identity Center session: sign in under Settings > Connections. Plan sees read tools, accept edits also write, bypass trusts every tool. Kiro reports credits, not dollars.',
}
function showSdk(current) {
  const sdk = form.elements.sdk.value
  const noAuto = sdk !== 'claude'
  const modes = noAuto ? MODES.filter(([value]) => NO_AUTO_MODES.includes(value)) : MODES
  clear(area('bot-mode')).append(...modes.map(([value, text]) => el('option', { value, text })))
  form.elements.permission_mode.value = modes.some(([value]) => value === current) ? current : noAuto ? 'acceptEdits' : 'auto'
  area('bot-provider-row').hidden = sdk !== 'openai'
  const hint = sdk === 'openai' ? HINTS[form.elements.provider.value] : sdk === 'kiro' ? HINTS.kiro : ''
  area('bot-sdk-hint').textContent = hint
  area('bot-sdk-hint').hidden = !hint
}
