import { contextBridge, ipcRenderer } from 'electron'
import type { ThemePreference } from '../shared/types'

const api = {
  checkCliTools: () => ipcRenderer.invoke('tools:check'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme: ThemePreference) => ipcRenderer.invoke('settings:setTheme', theme),
  setForceRemoveWorktree: (enabled: boolean) =>
    ipcRenderer.invoke('settings:setForceRemoveWorktree', enabled),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),

  listRepos: () => ipcRenderer.invoke('repos:list'),
  importRepo: () => ipcRenderer.invoke('repos:import'),
  removeRepo: (repoPath: string) => ipcRenderer.invoke('repos:remove', repoPath),

  getLog: (repoPath: string) => ipcRenderer.invoke('git:log', repoPath),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  getWorktrees: (repoPath: string) => ipcRenderer.invoke('git:worktrees', repoPath),
  getDefaultBranch: (repoPath: string) => ipcRenderer.invoke('git:defaultBranch', repoPath),

  createBranch: (repoPath: string, name: string, startPoint: string) =>
    ipcRenderer.invoke('git:createBranch', repoPath, name, startPoint),
  deleteBranch: (repoPath: string, name: string, force: boolean) =>
    ipcRenderer.invoke('git:deleteBranch', repoPath, name, force),
  createWorktree: (repoPath: string, worktreePath: string, branch: string, createNewBranch: boolean) =>
    ipcRenderer.invoke('git:createWorktree', repoPath, worktreePath, branch, createNewBranch),
  removeWorktree: (repoPath: string, worktreePath: string) =>
    ipcRenderer.invoke('git:removeWorktree', repoPath, worktreePath),

  getCommitFiles: (repoPath: string, hash: string) => ipcRenderer.invoke('git:commitFiles', repoPath, hash),
  getCommitDiff: (repoPath: string, hash: string, filePath: string) =>
    ipcRenderer.invoke('git:commitDiff', repoPath, hash, filePath),
  getRangeFiles: (repoPath: string, base: string, head: string) =>
    ipcRenderer.invoke('git:rangeFiles', repoPath, base, head),
  getRangeDiff: (repoPath: string, base: string, head: string, filePath: string) =>
    ipcRenderer.invoke('git:rangeDiff', repoPath, base, head, filePath),

  getPullRequests: (repoPath: string) => ipcRenderer.invoke('gh:pullRequests', repoPath),
  getPullRequestDetail: (repoPath: string, number: number) =>
    ipcRenderer.invoke('gh:pullRequestDetail', repoPath, number),
  getIssues: (repoPath: string) => ipcRenderer.invoke('gh:issues', repoPath),
  getIssueDetail: (repoPath: string, number: number) =>
    ipcRenderer.invoke('gh:issueDetail', repoPath, number),
  getProjects: (repoPath: string) => ipcRenderer.invoke('gh:projects', repoPath),
  getProjectBoard: (repoPath: string, owner: string, number: number) =>
    ipcRenderer.invoke('gh:projectBoard', repoPath, owner, number),

  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
  listOpenerApps: () => ipcRenderer.invoke('open:apps'),
  openInApp: (targetPath: string, appId: string) => ipcRenderer.invoke('open:inApp', targetPath, appId),
  selectDirectory: (title: string) => ipcRenderer.invoke('dialog:selectDirectory', title)
}

contextBridge.exposeInMainWorld('gitdesktop', api)

export type GitDesktopApi = typeof api
