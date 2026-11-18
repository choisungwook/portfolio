// The bot settings dialog: create a bot (from a preset or blank) or edit one. The gear on a bot and the right-click
// menu open it. Name is fixed after creation; taskq, the orchestrator, can be neither disabled nor deleted.
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
let presets = {}

function lines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function init() {
  if (dialog) return
  dialog = area('bot-settings')
  form = area('bot-form')
  clear(area('bot-mode')).append(...MODES.map(([value, text]) => el('option', { value, text })))
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', save)
  area('bot-preset').addEventListener('change', () => {
    const preset = presets[area('bot-preset').value]
    if (!preset) return
    form.elements.role.value = preset.role
    form.elements.description.value = preset.description
    form.elements.instructions.value = preset.instructions
  })
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
    clear(box).append(el('p', { class: 'meta', text: `No ${kind}s registered. Add them in Settings.` }))
    return
  }
  clear(box).append(el('p', { class: 'pick-title', text: kind === 'skill' ? 'Skills' : 'Plugins' }), ...entries.map((entry) => el('label', { class: 'check' },
    el('input', { type: 'checkbox', name: kind, value: entry.name, checked: chosen.includes(entry.name) || null }),
    ` ${entry.name}`, entry.ok ? null : el('span', { class: 'meta', text: ' (missing)' }))))
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
    const [settings, bot, loadedPresets] = await Promise.all([
      api.get('/settings'), name ? api.get(`/bots/${name}`) : null, name ? presets : api.get('/bots/presets'),
    ])
    presets = loadedPresets
    const value = bot ?? { role: 'custom', description: '', instructions: '', model: null, workdir: null, permission_mode: 'auto',
      sandbox: false, allowed_domains: [], blocked_commands: [], skills: [], plugins: [], enabled: true, may_message_user: false }
    area('bot-settings-title').textContent = name ? `${name} settings` : 'New bot'
    area('bot-name-row').hidden = Boolean(name)
    area('bot-preset-row').hidden = Boolean(name)
    clear(area('bot-preset')).append(el('option', { value: '', text: 'Blank' }), ...Object.keys(presets).map((key) => el('option', { value: key, text: key })))
    const f = form.elements
    f.name.value = ''
    f.role.value = value.role
    f.model.value = value.model ?? ''
    f.description.value = value.description
    f.instructions.value = value.instructions
    f.workdir.value = value.workdir ?? ''
    f.permission_mode.value = value.permission_mode
    f.sandbox.checked = value.sandbox
    f.allowed_domains.value = value.allowed_domains.join('\n')
    f.blocked_commands.value = value.blocked_commands.join('\n')
    f.enabled.checked = value.enabled
    f.enabled.disabled = Boolean(bot?.system)
    f.may_message_user.checked = value.may_message_user
    remove.hidden = !name || Boolean(bot?.system)
    picks('bot-skills', 'skill', settings.bot_skills, value.skills)
    picks('bot-plugins', 'plugin', settings.bot_plugins, value.plugins)
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
    workdir: f.workdir.value, permission_mode: f.permission_mode.value, sandbox: f.sandbox.checked,
    allowed_domains: lines(f.allowed_domains.value), blocked_commands: lines(f.blocked_commands.value),
    skills: checked('skill'), plugins: checked('plugin'), enabled: f.enabled.checked, may_message_user: f.may_message_user.checked,
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
