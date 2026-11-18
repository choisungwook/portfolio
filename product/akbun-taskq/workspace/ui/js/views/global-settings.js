// The global part of the Settings dialog: appearance (font and size, applied to the whole app), whether the queue runs
// unowned tasks on its own, and the skill and plugin registry the bots pick from.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { applyLanguage, t } from '../core/i18n.js'

const LIMIT_FIELDS = [
  ['daily_budget_usd', 'Daily budget (USD)'], ['turns_per_hour_total', 'Turns per hour, all bots'],
  ['max_concurrent_turns', 'Bots working at once'], ['bot_turns_per_hour', 'Turns per hour per bot (default)'],
  ['turn_budget_usd', 'Budget per turn (default, USD)'], ['turn_max_turns', 'Model turns per turn (default)'],
]
const FOLDERS = [['shared', 'settings.folder.shared', 'Shared folder'], ['sessions', 'settings.folder.sessions', 'Session transcripts'], ['home', 'settings.folder.home', 'taskq data folder']]

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

export function applyAppearance({ font_family, font_size, language, theme }) {
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
  if (language) applyLanguage(language)
  const root = document.documentElement.style
  root.setProperty('--font-sans', (FONTS[font_family] ?? FONTS.system)[1])
  root.setProperty('--text-body', `${font_size}px/${Math.round(font_size * 1.46)}px`)
  root.setProperty('--text-small', `${font_size - 2}px`)
}

export function initGlobalSettings() {
  nodes = {
    family: area('font-family'), size: area('font-size'), sizeValue: area('font-size-value'), autorun: area('queue-autorun'),
    language: area('ui-language'), theme: area('ui-theme'), limits: area('limits-form'), folders: area('folder-list'),
  }
  clear(nodes.family).append(...Object.entries(FONTS).map(([value, [text]]) => el('option', { value, text })))
  const saveAppearance = () => {
    edits += 1
    const value = { font_family: nodes.family.value, font_size: Number(nodes.size.value), language: nodes.language.value, theme: nodes.theme.value }
    nodes.sizeValue.textContent = `${value.font_size}px`
    applyAppearance(value)
    mutate(() => api.post('/settings/appearance', value))
  }
  nodes.family.addEventListener('change', saveAppearance)
  nodes.language.addEventListener('change', saveAppearance)
  nodes.theme.addEventListener('change', saveAppearance)
  nodes.limits.addEventListener('submit', async (event) => {
    event.preventDefault()
    const patch = Object.fromEntries(LIMIT_FIELDS.map(([key]) => [key, Number(nodes.limits.elements[key].value)]))
    await mutate(() => api.post('/settings/limits', patch), t('settings.save', 'Saved'))
  })
  nodes.size.addEventListener('input', () => {
    edits += 1
    nodes.sizeValue.textContent = `${nodes.size.value}px`
    applyAppearance({ font_family: nodes.family.value, font_size: Number(nodes.size.value) })
  })
  nodes.size.addEventListener('change', saveAppearance)
  nodes.autorun.addEventListener('change', () => mutate(() => api.post('/settings/queue-autorun', { enabled: nodes.autorun.checked }),
    nodes.autorun.checked ? 'Unowned tasks run automatically' : 'Unowned tasks wait for the run button'))
  area('settings-button').addEventListener('click', loadGlobalSettings)
}

export async function loadGlobalSettings() {
  const seen = edits
  try {
    const settings = await api.get('/settings')
    nodes.autorun.checked = settings.queue_autorun
    if (seen !== edits) return
    renderLimits(settings.limits, settings.limit_ranges)
    renderFolders(settings.paths)
    nodes.family.value = settings.appearance.font_family
    nodes.language.value = settings.appearance.language
    nodes.theme.value = settings.appearance.theme
    nodes.size.value = String(settings.appearance.font_size)
    nodes.sizeValue.textContent = `${settings.appearance.font_size}px`
    applyAppearance(settings.appearance)
  } catch {
    // Without a token nothing loads; the token notice already says so.
  }
}

function renderLimits(values, ranges) {
  clear(nodes.limits).append(
    ...LIMIT_FIELDS.map(([key, english]) => el('label', {},
      t(`limit.${key}`, english),
      el('input', { type: 'number', name: key, value: String(values[key]), min: String(ranges[key].min), max: String(ranges[key].max), step: ranges[key].integer ? '1' : '0.01', required: true }))),
    el('button', { type: 'submit', text: t('settings.save', 'Save') }))
}

function renderFolders(paths) {
  clear(nodes.folders).append(...FOLDERS.map(([target, key, english]) => el('li', { class: 'folder-row' },
    el('div', {}, el('strong', { text: t(key, english) }), el('code', { class: 'skill-path', text: paths[target] })),
    el('button', { type: 'button', text: t('settings.open', 'Open'), onclick: () => mutate(() => api.post('/open-folder', { target })) }))))
}
