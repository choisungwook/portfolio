import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage, session, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Score } from '../core/model.ts'
import type { MeasureOrigin, TaskContext, VisionLlm } from '../core/ports.ts'
import * as library from './library.ts'
import { loadSettings, mergeSettings, saveSettings, type Settings } from './settings.ts'
import { checkUpdate, cleanupTempDirs, downloadDmg, releaseDownloadUrl, spawnSwap } from './update.ts'
import { createClaudeVision } from './vision/claude-api.ts'
import { createCodexVision } from './vision/codex.ts'

const ROOT = path.join(os.homedir(), 'PianoCoach')
let window: BrowserWindow | null = null
let task: AbortController | null = null

function createWindow(): void {
  window = new BrowserWindow({
    width: 1360,
    height: 900,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17191d' : '#f7f6f3',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  window.on('closed', () => (window = null))
}

function apiKey(settings: Settings): string | null {
  if (!settings.apiKeyEncrypted || !safeStorage.isEncryptionAvailable()) return null
  return safeStorage.decryptString(Buffer.from(settings.apiKeyEncrypted, 'base64'))
}

function visionFor(settings: Settings): VisionLlm {
  return settings.vision === 'claude-api'
    ? createClaudeVision(apiKey(settings), settings.claudeModel)
    : createCodexVision(settings.codexPath, settings.codexModel)
}

// One background task at a time (OMR). Progress goes to the renderer; Cancel aborts it.
async function runTask<T>(work: (ctx: TaskContext) => Promise<T>): Promise<T> {
  if (task) throw new Error('another task is running')
  task = new AbortController()
  const ctx: TaskContext = {
    signal: task.signal,
    progress: (p) => window?.webContents.send('task:progress', p),
    log: (level, message) => window?.webContents.send('task:log', { level, message }),
  }
  try {
    return await work(ctx)
  } finally {
    task = null
    window?.webContents.send('task:progress', null)
  }
}

function assertId(value: unknown): asserts value is string {
  // Ids become folder names under library/; '.' and '..' would point at the library or its parent.
  if (typeof value !== 'string' || !/^[\w가-힣.-]+$/.test(value) || /^\.+$/.test(value)) throw new Error('invalid id')
}

function registerIpc(): void {
  ipcMain.handle('library:list', () => library.listSongs(ROOT))
  ipcMain.handle('library:load', (_e, id: unknown) => {
    assertId(id)
    return library.loadSong(ROOT, id)
  })
  ipcMain.handle('library:import', async () => {
    const all = Object.values(library.IMPORT_EXTENSIONS).flat()
    const picked = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Score, MIDI or page images', extensions: all }],
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    const files = picked.filePaths
    const images = files.filter((f) => library.IMPORT_EXTENSIONS.images.includes(path.extname(f).slice(1).toLowerCase()))
    if (images.length === 0) return { id: await library.importScoreFile(ROOT, files[0]) }
    const settings = await loadSettings(ROOT)
    const llm = visionFor(settings)
    const availability = await llm.available()
    if (!availability.ok) throw new Error(availability.hint)
    const title = path.basename(images[0], path.extname(images[0]))
    return runTask((ctx) => library.importImages(ROOT, images.sort(), title, llm, ctx))
  })
  ipcMain.handle('library:save-score', (_e, score: Score, origins?: MeasureOrigin[]) => {
    assertId(score?.id)
    return library.saveScore(ROOT, score, origins)
  })
  ipcMain.handle('task:cancel', () => task?.abort())
  ipcMain.handle('settings:get', async () => {
    const { apiKeyEncrypted, ...rest } = await loadSettings(ROOT)
    return { ...rest, hasApiKey: !!apiKeyEncrypted, root: ROOT }
  })
  ipcMain.handle('settings:save', async (_e, input: unknown) => saveSettings(ROOT, mergeSettings(await loadSettings(ROOT), input)))
  ipcMain.handle('settings:set-api-key', async (_e, key: unknown) => {
    const settings = await loadSettings(ROOT)
    if (typeof key === 'string' && key.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain encryption is not available')
      settings.apiKeyEncrypted = safeStorage.encryptString(key.trim()).toString('base64')
    } else delete settings.apiKeyEncrypted
    await saveSettings(ROOT, settings)
  })
  ipcMain.handle('vision:status', async () => visionFor(await loadSettings(ROOT)).available())
  ipcMain.handle('shell:open-library', () => shell.openPath(ROOT))
}

function appBundlePath(): string {
  return path.resolve(app.getPath('exe'), '../../..')
}

let updating = false

async function installMac(dmgUrl: string): Promise<void> {
  updating = true
  let dmgPath: string | null = null
  try {
    dmgPath = await downloadDmg(dmgUrl)
    await spawnSwap(appBundlePath(), dmgPath)
    app.quit()
  } catch (error) {
    if (dmgPath) await fs.rm(path.dirname(dmgPath), { recursive: true, force: true })
    updating = false
    await dialog.showMessageBox({ type: 'error', message: 'Update failed', detail: String(error) })
  }
}

// electron-updater installs unsigned NSIS builds when verifyUpdateCodeSignature is false (package.json build.win).
async function installWindows(tag: string): Promise<void> {
  updating = true
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.setFeedURL({ provider: 'generic', url: releaseDownloadUrl(tag) })
    await autoUpdater.checkForUpdates()
    await autoUpdater.downloadUpdate()
    autoUpdater.quitAndInstall()
  } catch (error) {
    updating = false
    await dialog.showMessageBox({ type: 'error', message: 'Update failed', detail: String(error) })
  }
}

async function runUpdateCheck(): Promise<void> {
  if (updating) return
  try {
    const result = await checkUpdate(app.getVersion())
    if (!result.hasUpdate) {
      await dialog.showMessageBox({ type: 'info', message: 'You have the latest version', detail: `Version ${result.current}` })
      return
    }
    // Under npm start the bundle to replace is Electron itself, so only packaged builds install.
    const canInstall = app.isPackaged && ((process.platform === 'darwin' && result.dmgUrl !== null) || process.platform === 'win32')
    const buttons = canInstall ? ['Update now', 'Open release', 'Close'] : ['Open release', 'Close']
    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Version ${result.latest} is available`,
      detail: canInstall ? `You have ${result.current}. Update now downloads it, replaces the app and restarts.` : `You have ${result.current}.`,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
    })
    if (canInstall && answer.response === 0) {
      if (process.platform === 'darwin') await installMac(result.dmgUrl!)
      else await installWindows(result.tag!)
      return
    }
    if (answer.response === (canInstall ? 1 : 0) && result.url) await shell.openExternal(result.url)
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', message: 'Could not check for updates', detail: String(error) })
  }
}

function buildMenu(): void {
  const update: MenuItemConstructorOptions = { label: 'Check for Updates…', click: () => void runUpdateCheck() }
  const template: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{ label: app.name, submenu: [{ role: 'about' }, update, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] }]
    : [{ label: 'File', submenu: [update, { type: 'separator' }, { role: 'quit' }] }]
  template.push({ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  void cleanupTempDirs().catch(() => {})
  const allowed = new Set(['midi', 'midiSysex', 'media'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
