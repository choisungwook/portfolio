import { contextBridge, ipcRenderer } from 'electron'

const api = {
  listRepos: () => ipcRenderer.invoke('repos:list'),
  importRepo: () => ipcRenderer.invoke('repos:import'),
  removeRepo: (repoPath: string) => ipcRenderer.invoke('repos:remove', repoPath),

  getLog: (repoPath: string) => ipcRenderer.invoke('git:log', repoPath),
  getBranches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
  getWorktrees: (repoPath: string) => ipcRenderer.invoke('git:worktrees', repoPath),

  createBranch: (repoPath: string, name: string, startPoint: string) =>
    ipcRenderer.invoke('git:createBranch', repoPath, name, startPoint),
  deleteBranch: (repoPath: string, name: string, force: boolean) =>
    ipcRenderer.invoke('git:deleteBranch', repoPath, name, force),
  createWorktree: (repoPath: string, worktreePath: string, branch: string, createNewBranch: boolean) =>
    ipcRenderer.invoke('git:createWorktree', repoPath, worktreePath, branch, createNewBranch),
  removeWorktree: (repoPath: string, worktreePath: string, force: boolean) =>
    ipcRenderer.invoke('git:removeWorktree', repoPath, worktreePath, force),

  getPullRequests: (repoPath: string) => ipcRenderer.invoke('gh:pullRequests', repoPath),

  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
  listOpenerApps: () => ipcRenderer.invoke('open:apps'),
  openInApp: (targetPath: string, appId: string) => ipcRenderer.invoke('open:inApp', targetPath, appId),
  selectDirectory: (title: string) => ipcRenderer.invoke('dialog:selectDirectory', title)
}

contextBridge.exposeInMainWorld('gitdesktop', api)

export type GitDesktopApi = typeof api
