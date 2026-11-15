// The registered access skills. Removing takes two clicks: "−" asks, "Remove" confirms. The server's message is shown
// next to the row, so a 409 explains which open tasks still use the skill.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'

const EMPTY = 'No access skills yet. An access skill is one of your Claude Code skills that signs in to the account a task works on. Add one with +; taskq stores only its path.'

export function renderSkillList(rows) {
  const list = area('access-skills')
  if (rows.length === 0) {
    clear(list).append(el('li', { class: 'empty', text: EMPTY }))
    return
  }
  clear(list).append(...rows.map(skillRow))
}

export function showSkillListError(message) {
  clear(area('access-skills')).append(el('li', { class: 'error', role: 'alert', text: message }))
}

function skillRow(row) {
  const actions = el('div', { class: 'skill-actions' })
  actions.append(minusButton(row, actions))
  return el('li', { class: 'skill-row', dataset: { skill: row.name } },
    el('div', { class: 'skill-head' },
      el('strong', { text: row.name }),
      row.ok ? null : el('span', { class: 'missing-label', text: 'missing' })),
    row.description ? el('p', { class: 'meta', text: row.description }) : null,
    el('code', { class: 'skill-path', text: row.path }),
    actions)
}

function minusButton(row, box) {
  return el('button', {
    type: 'button',
    class: 'skill-minus',
    'aria-label': `Remove ${row.name}`,
    text: '−',
    onclick: () => {
      const confirm = confirmRow(row, box)
      clear(box).append(confirm)
      confirm.querySelector('.skill-remove').focus()
    },
  })
}

function confirmRow(row, box) {
  const message = el('p', { class: 'error', role: 'alert' })
  const remove = el('button', {
    type: 'button',
    class: 'skill-remove',
    text: 'Remove',
    onclick: () => removeSkill(row, message),
  })
  return el('div', { class: 'skill-confirm' },
    el('span', { class: 'meta', text: `Remove ${row.name} from taskq? Its files stay where they are.` }),
    remove,
    el('button', { type: 'button', text: 'Cancel', onclick: () => clear(box).append(minusButton(row, box)) }),
    message)
}

// The button stays enabled while the request runs, so a failed request leaves focus on it.
async function removeSkill(row, message) {
  message.textContent = ''
  try {
    await api.del(`/access-skills/${encodeURIComponent(row.name)}`, {})
    emit('skills-changed')
  } catch (error) {
    message.textContent = error.message
  }
}
