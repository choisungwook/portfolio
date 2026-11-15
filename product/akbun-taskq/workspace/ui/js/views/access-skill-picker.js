// The add panel: skills found under the discovery roots that are not registered yet, and a typed absolute path.
// Each error is shown next to the control that caused it.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'

let addButton
let panel
let found
let pathForm
let pathError

export function initAccessSkillPicker() {
  addButton = area('access-skill-add')
  panel = area('access-skill-picker')
  found = area('access-skill-found')
  pathForm = area('access-skill-path-form')
  pathError = area('access-skill-error')
  addButton.addEventListener('click', () => (panel.hidden ? openPanel() : resetPicker()))
  pathForm.addEventListener('submit', addTypedPath)
}

export function resetPicker() {
  panel.hidden = true
  addButton.setAttribute('aria-expanded', 'false')
  pathError.textContent = ''
  pathForm.reset()
  clear(found)
}

async function openPanel() {
  panel.hidden = false
  addButton.setAttribute('aria-expanded', 'true')
  pathError.textContent = ''
  await loadFound()
  pathForm.elements.path.focus()
}

async function loadFound() {
  clear(found)
  try {
    const skills = (await api.get('/skills/discover')).filter((skill) => !skill.registered)
    if (skills.length === 0) {
      found.append(el('li', { class: 'empty', text: 'No unregistered skills found in your Claude skills folder or the configured skillsDir. Enter a path below.' }))
      return
    }
    found.append(...skills.map(foundRow))
  } catch (error) {
    found.append(el('li', { class: 'error', role: 'alert', text: error.message }))
  }
}

function foundRow(skill) {
  const message = el('p', { class: 'error', role: 'alert' })
  const add = el('button', {
    type: 'button',
    'aria-label': `Add ${skill.name}`,
    text: 'Add',
    onclick: () => register(skill.path, message),
  })
  return el('li', { class: 'skill-row' },
    el('div', { class: 'skill-head' }, el('strong', { text: skill.name })),
    skill.description ? el('p', { class: 'meta', text: skill.description }) : null,
    el('code', { class: 'skill-path', text: skill.path }),
    el('div', { class: 'skill-actions' }, add),
    message)
}

// Registers one path. On success the dialog reloads its list and the panel drops the row.
async function register(path, message) {
  message.textContent = ''
  try {
    await api.post('/access-skills', { path })
    emit('skills-changed')
    await loadFound()
    return true
  } catch (error) {
    message.textContent = error.message
    return false
  }
}

async function addTypedPath(event) {
  event.preventDefault()
  const path = pathForm.elements.path.value.trim()
  pathError.textContent = ''
  if (path === '') {
    pathError.textContent = 'Enter the absolute path to a skill folder.'
    return
  }
  if (await register(path, pathError)) pathForm.reset()
}
