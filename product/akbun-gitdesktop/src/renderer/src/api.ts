import { invoke } from '@tauri-apps/api/core'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'
import type {
  AppSettings,
  BranchDeletionResult,
  BranchInfo,
  CliStatus,
  CommitInfo,
  FileChange,
  GitResult,
  IssueInfo,
  OpenerApp,
  ProjectBoard,
  ProjectListResult,
  PullRequestInfo,
  RepoEntry,
  RepoSizeInfo,
  ThemePreference,
  ThreadDetail,
  WorktreeInfo
} from '../../shared/types'

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<GitResult<T>> {
  try {
    return { ok: true, data: await invoke<T>(command, args) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function selectDirectory(title: string): Promise<GitResult<string>> {
  try {
    const selected = await open({ title, directory: true, multiple: false })
    return { ok: true, data: typeof selected === 'string' ? selected : '' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function importRepo(): Promise<GitResult<RepoEntry[]>> {
  const selected = await selectDirectory('Select a git repository folder')
  if (!selected.ok || selected.data === '') return selected.ok ? call('list_repos') : selected
  return call('import_repo', { repoPath: selected.data })
}

async function removeWorktree(repoPath: string, worktreePath: string): Promise<GitResult<boolean>> {
  const settings = await call<AppSettings>('get_settings')
  if (!settings.ok) return settings
  const force = settings.data.forceRemoveWorktree
  const confirmed = await ask(
    force
      ? `${worktreePath}\n\nUncommitted and untracked changes in this worktree can be discarded.`
      : worktreePath,
    {
      title: force ? 'Force remove this worktree?' : 'Remove this worktree?',
      kind: force ? 'warning' : 'info',
      okLabel: force ? 'Force remove' : 'Remove',
      cancelLabel: 'Cancel'
    }
  )
  if (!confirmed) return { ok: true, data: false }
  return call('remove_worktree', { repoPath, worktreePath })
}

async function checkForUpdates(): Promise<void> {
  try {
    const update = await check()
    if (!update) {
      await message('You are on the latest version.', { title: 'Check for Updates', kind: 'info' })
      return
    }
    const install = await ask(
      `Version ${update.version} is available. Download and install it now?`,
      { title: 'Update available', kind: 'info', okLabel: 'Update now', cancelLabel: 'Later' }
    )
    if (!install) return
    await update.downloadAndInstall()
    await relaunch()
  } catch (error) {
    await message(error instanceof Error ? error.message : String(error), {
      title: 'Could not update',
      kind: 'error'
    })
  }
}

const api = {
  checkCliTools: () => call<CliStatus>('check_cli_tools'),
  getSettings: () => call<AppSettings>('get_settings'),
  setTheme: (theme: ThemePreference) => call<AppSettings>('set_theme', { theme }),
  setForceRemoveWorktree: (enabled: boolean) =>
    call<AppSettings>('set_force_remove_worktree', { enabled }),
  checkForUpdates,

  listRepos: () => call<RepoEntry[]>('list_repos'),
  getRepoSizes: () => call<RepoSizeInfo[]>('get_repo_sizes'),
  importRepo,
  removeRepo: (repoPath: string) => call<RepoEntry[]>('remove_repo', { repoPath }),

  getLog: (repoPath: string) => call<CommitInfo[]>('get_log', { repoPath }),
  getBranches: (repoPath: string) => call<BranchInfo[]>('get_branches', { repoPath }),
  getWorktrees: (repoPath: string) => call<WorktreeInfo[]>('get_worktrees', { repoPath }),
  getDefaultBranch: (repoPath: string) => call<string>('get_default_branch', { repoPath }),
  createBranch: (repoPath: string, name: string, startPoint: string) =>
    call<void>('create_branch', { repoPath, name, startPoint }),
  deleteBranches: (repoPath: string, names: string[], force: boolean) =>
    call<BranchDeletionResult>('delete_branches', { repoPath, names, force }),
  createWorktree: (repoPath: string, worktreePath: string, branch: string, createNewBranch: boolean) =>
    call<void>('create_worktree', { repoPath, worktreePath, branch, createNewBranch }),
  removeWorktree,

  getCommitFiles: (repoPath: string, hash: string) =>
    call<FileChange[]>('get_commit_files', { repoPath, hash }),
  getCommitDiff: (repoPath: string, hash: string, filePath: string) =>
    call<string>('get_commit_diff', { repoPath, hash, filePath }),
  getRangeFiles: (repoPath: string, base: string, head: string) =>
    call<FileChange[]>('get_range_files', { repoPath, base, head }),
  getRangeDiff: (repoPath: string, base: string, head: string, filePath: string) =>
    call<string>('get_range_diff', { repoPath, base, head, filePath }),

  getPullRequests: (repoPath: string) => call<PullRequestInfo[]>('get_pull_requests', { repoPath }),
  getPullRequestDetail: (repoPath: string, number: number) =>
    call<ThreadDetail>('get_pull_request_detail', { repoPath, number }),
  getIssues: (repoPath: string) => call<IssueInfo[]>('get_issues', { repoPath }),
  getIssueDetail: (repoPath: string, number: number) =>
    call<ThreadDetail>('get_issue_detail', { repoPath, number }),
  getProjects: (repoPath: string) => call<ProjectListResult>('get_projects', { repoPath }),
  getProjectBoard: (repoPath: string, owner: string, number: number) =>
    call<ProjectBoard>('get_project_board', { repoPath, owner, number }),

  openExternal: (url: string) => call<void>('open_external', { url }),
  listOpenerApps: () => call<OpenerApp[]>('list_opener_apps'),
  openInApp: (targetPath: string, appId: string) =>
    call<void>('open_in_app', { targetPath, appId }),
  selectDirectory
}

export type GitDesktopApi = typeof api

export function initializeGitDesktopApi(): void {
  window.gitdesktop = api
}
