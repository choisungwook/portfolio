import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import type { GitResult } from '../shared/types'
import * as git from './git'
import { openInApp, listOpenerApps } from './openWith'
import { addRepo, loadRepos, removeRepo } from './repoStore'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'akbun-gitdesktop',
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
  ipcMain.handle('repos:list', () => wrap(() => loadRepos()))
  ipcMain.handle('repos:remove', (_event, repoPath: string) => wrap(() => removeRepo(repoPath)))

  ipcMain.handle('repos:import', () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({
        title: 'git 저장소 폴더 선택',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return loadRepos()
      }
      const selected = result.filePaths[0]
      if (!(await git.isGitRepository(selected))) {
        throw new Error('선택한 폴더는 git 저장소가 아닙니다.')
      }
      return addRepo(selected)
    })
  )

  ipcMain.handle('git:log', (_event, repoPath: string) => wrap(() => git.getLog(repoPath)))
  ipcMain.handle('git:branches', (_event, repoPath: string) => wrap(() => git.getBranches(repoPath)))
  ipcMain.handle('git:worktrees', (_event, repoPath: string) => wrap(() => git.getWorktrees(repoPath)))

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

  ipcMain.handle('gh:pullRequests', (_event, repoPath: string) => wrap(() => git.getPullRequests(repoPath)))

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

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
