// The global part of the Settings dialog: appearance (font and size, applied to the whole app), whether the queue runs
// unowned tasks on its own, and the skill and plugin registry the bots pick from.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'

// Font choices. A face that is not installed falls back to the system font.
const FONTS = {
  system: ['System', 'system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", sans-serif'],
  pretendard: ['Pretendard', '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif'],
  'noto-sans-kr': ['Noto Sans KR', '"Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif'],
  'ibm-plex-sans': ['IBM Plex Sans', '"IBM Plex Sans", "IBM Plex Sans KR", system-ui, sans-serif'],
  serif: ['Serif', '"Noto Serif KR", Georgia, serif'],
  mono: ['Monospace', 'ui-monospace, "SF Mono", Menlo, monospace'],
}

let nodes
let edits = 0   // bumped by every change, so a load that started earlier does not undo it

export function applyAppearance({ font_family, font_size }) {
  const root = document.documentElement.style
  root.setProperty('--font-sans', (FONTS[font_family] ?? FONTS.system)[1])
  root.setProperty('--text-body', `${font_size}px/${Math.round(font_size * 1.46)}px`)
  root.setProperty('--text-small', `${font_size - 2}px`)
}

export function initGlobalSettings() {
  nodes = {
    family: area('font-family'), size: area('font-size'), sizeValue: area('font-size-value'), autorun: area('queue-autorun'),
    skill: area('registry-skill'), plugin: area('registry-plugin'),
  }
  clear(nodes.family).append(...Object.entries(FONTS).map(([value, [text]]) => el('option', { value, text })))
  const saveAppearance = () => {
    edits += 1
    const value = { font_family: nodes.family.value, font_size: Number(nodes.size.value) }
    nodes.sizeValue.textContent = `${value.font_size}px`
    applyAppearance(value)
    mutate(() => api.post('/settings/appearance', value))
  }
  nodes.family.addEventListener('change', saveAppearance)
  nodes.size.addEventListener('input', () => {
    edits += 1
    nodes.sizeValue.textContent = `${nodes.size.value}px`
    applyAppearance({ font_family: nodes.family.value, font_size: Number(nodes.size.value) })
  })
  nodes.size.addEventListener('change', saveAppearance)
  nodes.autorun.addEventListener('change', () => mutate(() => api.post('/settings/queue-autorun', { enabled: nodes.autorun.checked }),
    nodes.autorun.checked ? 'Unowned tasks run automatically' : 'Unowned tasks wait for the run button'))
  for (const kind of ['skill', 'plugin']) {
    area(`registry-${kind}-form`).addEventListener('submit', async (event) => {
      event.preventDefault()
      const input = event.currentTarget.elements.path
      if (await mutate(() => api.post(`/bot-${kind}s`, { path: input.value.trim() }), `${kind === 'skill' ? 'Skill' : 'Plugin'} added`)) {
        input.value = ''
        loadGlobalSettings()
      }
    })
  }
  area('settings-button').addEventListener('click', loadGlobalSettings)
}

export async function loadGlobalSettings() {
  const seen = edits
  try {
    const settings = await api.get('/settings')
    renderRegistry('skill', settings.bot_skills)
    renderRegistry('plugin', settings.bot_plugins)
    nodes.autorun.checked = settings.queue_autorun
    if (seen !== edits) return
    nodes.family.value = settings.appearance.font_family
    nodes.size.value = String(settings.appearance.font_size)
    nodes.sizeValue.textContent = `${settings.appearance.font_size}px`
    applyAppearance(settings.appearance)
  } catch {
    // Without a token nothing loads; the token notice already says so.
  }
}

function renderRegistry(kind, entries) {
  const list = nodes[kind]
  if (entries.length === 0) {
    clear(list).append(el('li', { class: 'meta', text: `No ${kind}s registered.` }))
    return
  }
  clear(list).append(...entries.map((entry) => el('li', { class: 'skill-row' },
    el('div', {},
      el('strong', { text: entry.name }), entry.ok ? null : el('span', { class: 'badge', text: 'missing' }),
      entry.description ? el('p', { class: 'meta', text: entry.description }) : null,
      el('code', { class: 'skill-path', text: entry.path })),
    el('button', {
      type: 'button', 'aria-label': `Remove ${entry.name}`, text: '−',
      onclick: () => mutate(() => api.del(`/bot-${kind}s/${entry.name}`), `${entry.name} removed from every bot`).then(loadGlobalSettings),
    }))))
}
