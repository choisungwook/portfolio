// The bot settings dialog: create a bot or edit one. Creating asks only for a name, the agent type, how it signs in and a
// description; everything else starts with defaults and is edited later. Skills, plugins and MCP servers are not picked
// here: every bot of a type uses what the Plugins menu registers. The gear on a bot and the right-click menu open it. Name is fixed after
// creation; taskq, the orchestrator, can be neither disabled nor deleted.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { show } from '../core/nav.js'
import { t } from '../core/i18n.js'

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
  form.elements.provider.addEventListener('change', () => showHint())
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

// name null creates a bot.
export async function openBotSettings(name) {
  init()
  editing = name
  const remove = area('bot-delete')
  remove.dataset.confirm = 'false'
  remove.textContent = 'Delete bot'
  area('bot-form-error').textContent = ''
  try {
    const [conn, bot] = await Promise.all([api.get('/connection-settings').catch(() => ({})), name ? api.get(`/bots/${name}`) : null])
    claudeDefault = CLAUDE_FROM_CONN[conn.claude_provider] ?? 'subscription'
    const value = bot ?? { role: 'custom', description: '', instructions: '', model: null, workdir: null, permission_mode: 'auto',
      sandbox: false, allowed_domains: [], blocked_commands: [], skills: [], plugins: [], enabled: true, may_message_user: false,
      hourly_turns: null, turn_max_turns: null }
    area('bot-settings-title').textContent = name ? `${name} settings` : 'New bot'
    area('bot-name-row').hidden = Boolean(name)
    for (const node of form.querySelectorAll('[data-edit-only]')) node.hidden = !name
    for (const node of form.querySelectorAll('[data-create-only]')) node.hidden = Boolean(name)
    area('bot-save').textContent = name ? 'Save' : 'Create'
    const f = form.elements
    f.name.value = ''
    f.role.value = value.role
    f.description.value = value.description
    f.instructions.value = value.instructions
    f.workdir.value = value.workdir ?? ''
    f.sdk.value = value.sdk ?? 'claude'
    showSdk(value.permission_mode, value.provider)
    f.sandbox.checked = value.sandbox
    f.allowed_domains.value = value.allowed_domains.join('\n')
    f.blocked_commands.value = value.blocked_commands.join('\n')
    f.enabled.checked = value.enabled
    f.enabled.disabled = Boolean(bot?.system)
    f.may_message_user.checked = value.may_message_user
    f.hourly_turns.value = value.hourly_turns ?? ''
    f.turn_max_turns.value = value.turn_max_turns ?? ''
    f.charter_owns.value = value.charter_owns ?? ''
    f.charter_good.value = value.charter_good ?? ''
    f.charter_never.value = value.charter_never ?? ''
    f.ask_first.value = (value.ask_first ?? []).join('\n')
    area('bot-session-folder').hidden = !name
    remove.hidden = !name || Boolean(bot?.system)
    dialog.showModal()
    ;(name ? f.description : f.name).focus()
  } catch (error) {
    notify(error.message, true)
  }
}

async function save(event) {
  event.preventDefault()
  const f = form.elements
  const body = {
    role: f.role.value, description: f.description.value, instructions: f.instructions.value,
    workdir: f.workdir.value, permission_mode: f.permission_mode.value, sandbox: f.sandbox.checked, sdk: f.sdk.value,
    provider: f.provider.value || null,
    allowed_domains: lines(f.allowed_domains.value), blocked_commands: lines(f.blocked_commands.value),
    enabled: f.enabled.checked, may_message_user: f.may_message_user.checked,
    hourly_turns: f.hourly_turns.value === '' ? null : Number(f.hourly_turns.value),
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

// The permission modes the bot's SDK has. OpenAI has no auto mode, so a Claude bot switched to OpenAI moves to accept edits.
const NO_AUTO_MODES = ['plan', 'acceptEdits', 'bypassPermissions']
// How each agent type signs in: an SDK with an API key, the vendor's subscription, or AWS Bedrock. Kiro has one way.
const PROVIDERS = {
  claude: [['api', 'SDK (Anthropic API key)'], ['subscription', 'Subscription (signed-in Claude Code)'], ['bedrock', 'AWS Bedrock']],
  openai: [['api', 'SDK (OpenAI API key)'], ['chatgpt', 'Subscription (ChatGPT plan, Codex CLI)'], ['bedrock', 'AWS Bedrock']],
  kiro: [['', 'AWS IAM Identity Center (kiro-cli)']],
}
const CLAUDE_FROM_CONN = { api_key: 'api', subscription: 'subscription', bedrock: 'bedrock' }
let claudeDefault = 'subscription'
const HINTS = {
  'claude:api': 'Claude Agent SDK with the Anthropic API key saved in Settings > Connections (or ANTHROPIC_API_KEY).',
  'claude:subscription': 'Claude Agent SDK with the signed-in Claude Code (your Claude plan).',
  'claude:bedrock': 'Claude on Amazon Bedrock with the AWS profile and region chosen in Settings > Connections.',
  'openai:api': 'OpenAI Agents SDK with the key saved in Settings > Connections (or OPENAI_API_KEY). No auto mode: plan reads files, accept edits also writes in its folder and the shared folder, bypass also runs shell commands.',
  'openai:bedrock': 'OpenAI open-weight models (gpt-oss) on Amazon Bedrock. It signs in with the AWS profile chosen in Settings > Connections (an SSO profile works), or a Bedrock API key in AWS_BEARER_TOKEN_BEDROCK. Same tools as the API key bot.',
  'openai:chatgpt': 'Your ChatGPT plan through the Codex CLI: install codex and run codex login (Sign in with ChatGPT). Plan is a read-only sandbox, accept edits writes its folders, bypass has full access. No per-turn cost.',
  'kiro:': 'Kiro headless with your AWS IAM Identity Center session: sign in under Settings > Connections. Plan sees read tools, accept edits also write, bypass trusts every tool. Kiro reports credits, not dollars.',
}
function showHint() {
  const hint = HINTS[`${form.elements.sdk.value}:${form.elements.provider.value}`] ?? ''
  area('bot-sdk-hint').textContent = hint
  area('bot-sdk-hint').hidden = !hint
}
function showSdk(current, provider = form.elements.provider.value) {
  const sdk = form.elements.sdk.value
  const noAuto = sdk !== 'claude'
  const modes = noAuto ? MODES.filter(([value]) => NO_AUTO_MODES.includes(value)) : MODES
  clear(area('bot-mode')).append(...modes.map(([value, text]) => el('option', { value, text })))
  form.elements.permission_mode.value = modes.some(([value]) => value === current) ? current : noAuto ? 'acceptEdits' : 'auto'
  const options = PROVIDERS[sdk]
  const select = form.elements.provider
  clear(select).append(...options.map(([value, text]) => el('option', { value, text: t(`bot.auth.${sdk}.${value || 'sso'}`, text) })))
  const fallback = sdk === 'claude' ? claudeDefault : options[0][0]
  select.value = options.some(([value]) => value === provider) ? provider : fallback
  select.disabled = options.length === 1
  showHint()
}
