// The right side of the task detail, like the panel next to a Claude Desktop session: where the task works (its own
// worktree, a repository or a folder), the branch, the changed files with their diffs, the pull request or compare
// link, and buttons to open the folder in VS Code or the file manager.
import { api, mutate, notify } from '../core/api.js'
import { el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'

const STATUS_MARK = { added: 'A', modified: 'M', deleted: 'D', untracked: 'U', renamed: 'R' }

export function workspacePanel(task, onChange) {
  if (!task.data.repo) return null
  const aside = el('aside', { class: 'task-aside', 'data-area': 'task-workspace', 'aria-label': t('ws.title', 'Workspace') },
    el('h3', { text: t('ws.title', 'Workspace') }), el('p', { class: 'meta', text: '…' }))
  load(task, aside, onChange)
  return aside
}

async function load(task, aside, onChange) {
  let ws
  try {
    ws = await api.get(`/tasks/${task.id}/workspace`)
  } catch (error) {
    fill(aside, el('h3', { text: t('ws.title', 'Workspace') }), el('p', { class: 'error', text: error.message }))
    return
  }
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => notify(t('ws.copied', 'Copied')))
  const kindText = { worktree: t('ws.kind.worktree', 'Worktree'), repo: t('ws.kind.repo', 'Repository'), folder: t('ws.kind.folder', 'Folder') }[ws.kind] ?? ws.kind
  const diff = el('pre', { class: 'ws-diff', hidden: true })
  const rows = (ws.files ?? []).map((file) => el('li', {},
    el('button', {
      type: 'button', class: 'ws-file', title: file.path,
      onclick: async () => {
        try {
          const text = await api.text(`/tasks/${task.id}/workspace/diff?file=${encodeURIComponent(file.path)}`)
          fill(diff, ...text.split('\n').map((line) => el('span', {
            class: line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : line.startsWith('@@') ? 'hunk' : '',
            text: `${line}\n`,
          })))
          diff.hidden = false
          diff.scrollIntoView({ block: 'nearest' })
        } catch (error) {
          notify(error.message, true)
        }
      },
    },
    el('span', { class: 'ws-mark', dataset: { status: file.status }, text: STATUS_MARK[file.status] ?? '?' }),
    el('span', { class: 'ws-path', text: file.path }),
    file.additions === null ? null : el('span', { class: 'ws-count' }, el('span', { class: 'add', text: `+${file.additions}` }), ' ', el('span', { class: 'del', text: `-${file.deletions}` })))))
  fill(aside, 
    el('h3', { text: t('ws.title', 'Workspace') }),
    el('p', {}, el('span', { class: 'badge', text: kindText }), ws.removed ? el('span', { class: 'badge', text: t('ws.removed', 'removed') }) : null),
    el('dl', { class: 'facts ws-facts' },
      el('dt', { text: t('ws.path', 'Path') }), el('dd', {}, el('code', { text: ws.path }), ' ', el('button', { type: 'button', class: 'link', text: t('ws.copy', 'copy'), onclick: () => copy(ws.path) })),
      ws.branch ? el('dt', { text: t('ws.branch', 'Branch') }) : null, ws.branch ? el('dd', {}, el('code', { text: ws.branch }), ' ', el('button', { type: 'button', class: 'link', text: t('ws.copy', 'copy'), onclick: () => copy(ws.branch) })) : null,
      ws.worktree ? el('dt', { text: t('ws.base', 'Base') }) : null, ws.worktree ? el('dd', {}, el('code', { text: `${ws.worktree.base_branch} @ ${ws.worktree.base.slice(0, 8)}` })) : null,
      ws.source_repo ? el('dt', { text: t('ws.source', 'Repository') }) : null, ws.source_repo ? el('dd', {}, el('code', { text: ws.source_repo })) : null,
      ws.kind === 'worktree' ? el('dt', { text: t('ws.commits', 'Commits') }) : null, ws.kind === 'worktree' ? el('dd', { text: String(ws.commits_ahead) }) : null,
    ),
    el('div', { class: 'ws-actions' },
      ws.exists ? el('a', { class: 'button primary', href: ws.vscode_url, text: t('ws.vscode', 'Open in VS Code') }) : null,
      ws.exists ? el('button', { type: 'button', text: t('ws.folder', 'Open folder'), onclick: () => mutate(() => api.post('/open-folder', { target: 'task', task_id: task.id })) }) : null,
      ws.pr_url ? el('a', { class: 'button', href: ws.pr_url, target: '_blank', rel: 'noopener', text: t('ws.pr', 'Pull request') }) : null,
      !ws.pr_url && ws.compare_url ? el('a', { class: 'button', href: ws.compare_url, target: '_blank', rel: 'noopener', text: t('ws.compare', 'Compare / open a PR') }) : null,
      ws.kind === 'worktree' && !ws.removed && task.status !== 'running' ? el('button', {
        type: 'button', class: 'danger-quiet', text: t('ws.remove', 'Remove worktree'),
        onclick: async () => {
          if (!confirm(t('ws.remove_confirm', 'Remove the worktree folder? The branch stays in the repository.'))) return
          if (await mutate(() => api.post(`/tasks/${task.id}/workspace/remove`), t('ws.removed', 'removed'))) onChange()
        },
      }) : null,
    ),
    ws.kind === 'worktree' ? el('h4', { text: `${t('ws.changes', 'Changes')} (${rows.length})` }) : null,
    ws.kind === 'worktree' ? (rows.length ? el('ul', { class: 'ws-files' }, ...rows) : el('p', { class: 'meta', text: t('ws.no_changes', 'No changes yet.') })) : null,
    diff,
  )
}
