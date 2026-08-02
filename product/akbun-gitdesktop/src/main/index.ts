import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import path from 'node:path'
import type { GitResult, ThemePreference } from '../shared/types'
import * as git from './git'
import * as github from './github'
import { openInApp, listOpenerApps } from './openWith'
import { addRepo, loadRepos, removeRepo } from './repoStore'
import { loadSettings, saveTheme } from './settingsStore'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'akbun-gitdesktop',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e2127' : '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function wrap<T>(action: () => Promise<T>): Promise<GitResult<T>> {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('tools:check', () => wrap(() => git.checkCliTools()))
  ipcMain.handle('repos:list', () => wrap(() => loadRepos()))
  ipcMain.handle('repos:remove', (_event, repoPath: string) => wrap(() => removeRepo(repoPath)))

  ipcMain.handle('settings:get', () => wrap(() => loadSettings()))
  ipcMain.handle('settings:setTheme', (_event, theme: ThemePreference) =>
    wrap(async () => {
      const settings = await saveTheme(theme)
      nativeTheme.themeSource = settings.theme
      return settings
    })
  )

  ipcMain.handle('repos:import', () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Select a git repository folder',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return loadRepos()
      }
      const selected = result.filePaths[0]
      if (!(await git.isGitRepository(selected))) {
        throw new Error('The selected folder is not a git repository.')
      }
      return addRepo(selected)
    })
  )

  ipcMain.handle('git:log', (_event, repoPath: string) => wrap(() => git.getLog(repoPath)))
  ipcMain.handle('git:branches', (_event, repoPath: string) => wrap(() => git.getBranches(repoPath)))
  ipcMain.handle('git:worktrees', (_event, repoPath: string) => wrap(() => git.getWorktrees(repoPath)))
  ipcMain.handle('git:defaultBranch', (_event, repoPath: string) => wrap(() => git.getDefaultBranch(repoPath)))

  ipcMain.handle('git:createBranch', (_event, repoPath: string, name: string, startPoint: string) =>
    wrap(() => git.createBranch(repoPath, name, startPoint))
  )
  ipcMain.handle('git:deleteBranch', (_event, repoPath: string, name: string, force: boolean) =>
    wrap(() => git.deleteBranch(repoPath, name, force))
  )
  ipcMain.handle(
    'git:createWorktree',
    (_event, repoPath: string, worktreePath: string, branch: string, createNewBranch: boolean) =>
      wrap(() => git.createWorktree(repoPath, worktreePath, branch, createNewBranch))
  )
  ipcMain.handle('git:removeWorktree', (_event, repoPath: string, worktreePath: string, force: boolean) =>
    wrap(() => git.removeWorktree(repoPath, worktreePath, force))
  )

  ipcMain.handle('git:commitFiles', (_event, repoPath: string, hash: string) =>
    wrap(() => git.getCommitFiles(repoPath, hash))
  )
  ipcMain.handle('git:commitDiff', (_event, repoPath: string, hash: string, filePath: string) =>
    wrap(() => git.getCommitDiff(repoPath, hash, filePath))
  )
  ipcMain.handle('git:rangeFiles', (_event, repoPath: string, base: string, head: string) =>
    wrap(() => git.getRangeFiles(repoPath, base, head))
  )
  ipcMain.handle(
    'git:rangeDiff',
    (_event, repoPath: string, base: string, head: string, filePath: string) =>
      wrap(() => git.getRangeDiff(repoPath, base, head, filePath))
  )

  ipcMain.handle('gh:pullRequests', (_event, repoPath: string) =>
    wrap(() => github.getPullRequests(repoPath))
  )
  ipcMain.handle('gh:pullRequestDetail', (_event, repoPath: string, number: number) =>
    wrap(() => github.getPullRequestDetail(repoPath, number))
  )
  ipcMain.handle('gh:issues', (_event, repoPath: string) => wrap(() => github.getIssues(repoPath)))
  ipcMain.handle('gh:issueDetail', (_event, repoPath: string, number: number) =>
    wrap(() => github.getIssueDetail(repoPath, number))
  )
  ipcMain.handle('gh:projects', (_event, repoPath: string) => wrap(() => github.getProjects(repoPath)))
  ipcMain.handle('gh:projectBoard', (_event, repoPath: string, owner: string, number: number) =>
    wrap(() => github.getProjectBoard(repoPath, owner, number))
  )

  ipcMain.handle('open:external', (_event, url: string) => wrap(() => shell.openExternal(url)))
  ipcMain.handle('open:apps', () => wrap(async () => listOpenerApps()))
  ipcMain.handle('open:inApp', (_event, targetPath: string, appId: string) =>
    wrap(() => openInApp(targetPath, appId))
  )

  ipcMain.handle('dialog:selectDirectory', (_event, title: string) =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] })
      return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
    })
  )
}

app.whenReady().then(async () => {
  const settings = await loadSettings()
  nativeTheme.themeSource = settings.theme
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
