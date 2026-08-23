import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { GitResult, ThemePreference } from '../shared/types'
import * as git from './git'
import * as github from './github'
import { openInApp, listOpenerApps } from './openWith'
import { addRepo, loadRepos, removeRepo } from './repoStore'
import { loadSettings, saveForceRemoveWorktree, saveTheme } from './settingsStore'
import { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } from './update'

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
  ipcMain.handle('settings:setForceRemoveWorktree', (_event, enabled: boolean) =>
    wrap(() => saveForceRemoveWorktree(enabled))
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
  ipcMain.handle('git:removeWorktree', (_event, repoPath: string, worktreePath: string) =>
    wrap(async () => {
      const settings = await loadSettings()
      const force = settings.forceRemoveWorktree
      const answer = await dialog.showMessageBox({
        type: force ? 'warning' : 'question',
        message: force ? 'Force remove this worktree?' : 'Remove this worktree?',
        detail: force
          ? `${worktreePath}\n\nUncommitted and untracked changes in this worktree can be discarded.`
          : worktreePath,
        buttons: [force ? 'Force remove' : 'Remove', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (answer.response !== 0) return false
      await git.removeWorktree(repoPath, worktreePath, force)
      return true
    })
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
  ipcMain.handle('update:check', () => runUpdateCheck())
}

/** 실행 중인 .app 번들 경로. exe는 <앱>.app/Contents/MacOS/<실행파일>이다. */
function appBundlePath(): string {
  return path.resolve(app.getPath('exe'), '../../..')
}

/** 내려받기와 교체가 진행되는 동안 메뉴를 다시 눌러도 겹쳐 돌지 않게 막는다. */
let updating = false

/**
 * dmg를 받아 교체 스크립트를 띄우고 앱을 끈다. 재실행은 스크립트가 한다.
 * 스크립트를 띄우기 전에 실패하면 받아 둔 dmg를 지운다. 스크립트가 뜬 뒤에는
 * 스크립트의 trap이 정리를 맡는다.
 */
async function installUpdate(dmgUrl: string): Promise<void> {
  updating = true
  let dmgPath: string | null = null
  try {
    dmgPath = await downloadDmg(dmgUrl)
    await spawnSwap(appBundlePath(), dmgPath)
    app.quit()
  } catch (error) {
    if (dmgPath) await fsp.rm(path.dirname(dmgPath), { recursive: true, force: true })
    updating = false
    await dialog.showMessageBox({
      type: 'error',
      message: 'Failed to install the update',
      detail: String(error)
    })
  }
}

/** 메뉴에서 업데이트 확인을 눌렀을 때의 흐름. GitHub Release의 최신 버전과 비교한다. */
async function runUpdateCheck(): Promise<void> {
  if (updating) return
  try {
    const result = await checkUpdate(app.getVersion())
    if (!result.hasUpdate) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'You are on the latest version',
        detail: `Current version ${result.current}`
      })
      return
    }

    // 개발 모드(npm run dev)에서는 교체 대상이 Electron.app이라 설치를 막는다.
    // macOS 외의 빌드는 dmg 교체를 쓸 수 없으므로 릴리스 페이지만 연다.
    const canInstall = app.isPackaged && process.platform === 'darwin' && result.dmgUrl !== null
    const buttons = canInstall
      ? ['Update now', 'Open release', 'Close']
      : ['Open release', 'Close']
    const detail = canInstall
      ? `Current version ${result.current}. "Update now" downloads the dmg, replaces the app and restarts it.`
      : `Current version ${result.current}. Download the installer from the release page.`

    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Version ${result.latest} is available`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1
    })

    if (canInstall && answer.response === 0) {
      await installUpdate(result.dmgUrl!)
      return
    }
    const openIndex = canInstall ? 1 : 0
    if (answer.response === openIndex && result.url) await shell.openExternal(result.url)
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: 'Could not check for updates',
      detail: String(error)
    })
  }
}

/**
 * 업데이트 확인의 자리를 만들기 위한 메뉴다. macOS는 앱 이름 메뉴에 두고,
 * 그 메뉴가 없는 Windows와 Linux는 Help 메뉴에 둔다.
 * about과 hide는 macOS 전용 role이라 다른 플랫폼의 template에는 넣지 않는다.
 */
function buildMenu(): void {
  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => void runUpdateCheck()
  }
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            checkForUpdates,
            { type: 'separator' },
            { role: 'hide' },
            { role: 'quit' }
          ]
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ]
    : [
        { label: 'File', submenu: [{ role: 'quit' }] },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        { label: 'Help', submenu: [checkForUpdates] }
      ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  // 강제 종료로 남은 업데이트 임시 디렉터리를 지운다. 실패해도 앱 동작에는 지장 없다.
  void cleanupTempDirs().catch(() => {})
  const settings = await loadSettings()
  nativeTheme.themeSource = settings.theme
  registerIpcHandlers()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
