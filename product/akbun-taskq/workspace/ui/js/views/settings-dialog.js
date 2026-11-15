// Settings dialog: the access skill registry and the read-only configuration. Skill changes arrive on the bus and
// reload the dialog; closing it tells the task form to refresh its access skill list.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { initAccessSkillPicker, resetPicker } from './access-skill-picker.js'
import { renderSkillList, showSkillListError } from './access-skills.js'
import { initDbPath, showDbPath } from './db-path.js'

let dialog
let gear
let configList

export function initSettings() {
  dialog = area('settings-dialog')
  gear = area('settings-button')
  configList = area('settings-config')
  gear.addEventListener('click', () => {
    dialog.showModal()
    load()
  })
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    resetPicker()
    gear.focus()
    emit('settings-closed')
  })
  on('skills-changed', load)
  initAccessSkillPicker()
  initDbPath()
}

async function load() {
  if (!dialog.open) return
  try {
    const settings = await api.get('/settings')
    renderSkillList(settings.access_skills)
    showDbPath(settings.db_path)
    renderConfig(settings)
  } catch (error) {
    showSkillListError(error.message)
  }
}

function renderConfig(settings) {
  const entries = [...Object.entries(settings.config), ['home', settings.home]]
  clear(configList).append(...entries.flatMap(([key, value]) => [
    el('dt', { text: key }),
    el('dd', { text: typeof value === 'string' ? value : JSON.stringify(value) }),
  ]))
}
