// Add-task dialog: title, intent, files, an optional folder, the bot and workflow. Empty optional fields are left out so
// the server applies its defaults. Saved as a draft unless the draft box is cleared, which sends status "ready".
// There is no type to pick: a task with a folder works in it (code), one without writes a document (research).
import { api, mutate } from '../core/api.js'
import { area, el } from '../core/dom.js'
import { autosize } from '../core/autosize.js'
import { attachments } from '../core/attach.js'
import { emit } from '../core/bus.js'

const TEXT_FIELDS = ['title', 'intent', 'repo', 'workflow_id']

let dialog
let form
let files
let fitIntent
let error

export function initTaskForm() {
  dialog = area('task-form')
  form = area('task-form-form')
  error = area('task-form-error')
  area('new-task-button').addEventListener('click', () => {
    form.reset()
    files?.clear()
    setTimeout(() => fitIntent?.(), 0)
    error.textContent = ''
    dialog.showModal()
    form.elements.title.focus()
    loadBotOptions()
    loadRepoOptions()
    showRepo()
  })
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', submit)
  fitIntent = autosize(form.elements.intent, 360)
  let repoTimer
  form.elements.repo.addEventListener('input', () => {
    clearTimeout(repoTimer)
    repoTimer = setTimeout(showRepo, 300)
  })
  files = attachments({ zone: area('task-attach-zone'), button: area('task-attach'), chips: area('task-attachments'), pasteTarget: form })
  form.addEventListener('change', (event) => {
    if (event.target.name === 'workflow_id' || event.target.name === 'owner') showWorkflowHint()
  })
}

// Bots that can own the task and the workflows it can follow. A workflow without a bot would never run.
async function loadBotOptions() {
  try {
    const [bots, workflows] = await Promise.all([api.get('/bots'), api.get('/workflows')])
    form.elements.owner.replaceChildren(el('option', { value: '', text: 'none (the queue runs it)' }),
      ...bots.agents.filter((a) => a.enabled).map((a) => el('option', { value: a.name, text: a.name })))
    form.elements.workflow_id.replaceChildren(el('option', { value: '', text: 'none' }), ...workflows.map((w) => el('option', { value: w.id, text: w.name })))
  } catch {
    // Without the lists the task is still added; owner and workflow can be set in its detail.
  }
  showWorkflowHint()
}

function showWorkflowHint() {
  area('task-workflow-hint').hidden = !(form.elements.workflow_id.value && !form.elements.owner.value)
}

// Repositories to pick from; any absolute folder can be typed as well.
async function loadRepoOptions() {
  try {
    const repos = await api.get('/repos')
    area('repo-options').replaceChildren(...repos.map((r) => el('option', { value: r.path, text: r.branch ? `${r.path} (${r.branch})` : r.path })))
  } catch {
    // The field still takes a typed path.
  }
}

// The worktree switch shows for a task that writes code in a git repository; reading needs no worktree.
let repoInfo = null
async function showRepo() {
  const path = form.elements.repo.value.trim()
  const info = area('task-repo-info')
  repoInfo = null
  if (path) {
    try {
      repoInfo = await api.get(`/paths/check?path=${encodeURIComponent(path)}`)
    } catch {
      repoInfo = null
    }
  }
  info.textContent = !path ? '' : !repoInfo?.exists ? 'This folder does not exist.' : repoInfo.git ? `git repository on ${repoInfo.branch ?? '?'}` : 'plain folder (no git)'
  area('task-worktree-field').hidden = !repoInfo?.git
}

function body() {
  const data = new FormData(form)
  const out = { type: String(data.get('repo') ?? '').trim() ? 'code' : 'research' }
  if (!data.get('draft')) out.status = 'ready'
  if (data.get('review_required')) out.review_required = true
  for (const name of TEXT_FIELDS) {
    const value = String(data.get(name) ?? '').trim()
    if (value) out[name] = value
  }
  if (!area('task-worktree-field').hidden) out.worktree = data.has('worktree')
  const attached = files.files()
  if (attached.length) out.attachments = attached
  return out
}

async function submit(event) {
  event.preventDefault()
  error.textContent = ''
  const payload = body()
  const owner = form.elements.owner.value
  const created = await mutate(() => api.post('/tasks', payload), 'Task added')
  if (!created) {
    error.textContent = 'The task was not added. See the message at the top.'
    return
  }
  if (owner) await mutate(() => api.post(`/bots/tasks/${created.id}/owner`, { owner }))
  files.clear()
  dialog.close()
  emit('tasks-changed')
}
