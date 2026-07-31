'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  session,
  shell,
  systemPreferences,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings');
const {
  captureArea,
  savePreview,
  copyPreview,
  closePreview,
  openEditor,
  editorImage,
  saveEditor,
  closeEditor,
} = require('./capture');
const { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } = require('./update');

let settings = loadSettings();
let tray = null;
let settingsWindow = null;

function capture() {
  captureArea(() => settings.saveDir);
}

function registerShortcut(shortcut) {
  globalShortcut.unregisterAll();
  try {
    return globalShortcut.register(shortcut, capture);
  } catch {
    return false;
  }
}

// Running .app bundle path. exe is <app>.app/Contents/MacOS/<binary>.
function appBundlePath() {
  return path.resolve(app.getPath('exe'), '../../..');
}

// Guard so a second click cannot start an overlapping download.
let updating = false;

// Download the dmg, start the swap script, quit. The script relaunches the app.
async function installUpdate(dmgUrl) {
  updating = true;
  let dmgPath = null;
  try {
    dmgPath = await downloadDmg(dmgUrl);
    await spawnSwap(appBundlePath(), dmgPath);
    app.quit();
  } catch (error) {
    // Clear the flag first. A throwing rm must not leave the menu item dead.
    updating = false;
    if (dmgPath) {
      await fs.rm(path.dirname(dmgPath), { recursive: true, force: true }).catch(() => {});
    }
    await dialog.showMessageBox({
      type: 'error',
      message: 'Update failed',
      detail: String(error),
    });
  }
}

async function runUpdateCheck() {
  if (updating) return;
  try {
    const result = await checkUpdate(app.getVersion());
    if (!result.hasUpdate) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'You are on the latest version',
        detail: `Current version ${result.current}`,
      });
      return;
    }

    // In development the bundle is Electron.app, so installing is blocked.
    const canInstall = app.isPackaged && result.dmgUrl !== null;
    const buttons = canInstall
      ? ['Update Now', 'Open Release', 'Close']
      : ['Open Release', 'Close'];
    const detail = canInstall
      ? `Current version ${result.current}. Update Now downloads the dmg, replaces the app, and relaunches it.`
      : `Current version ${result.current}. Download the dmg from the release page.`;

    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Version ${result.latest} is available`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
    });

    if (canInstall && answer.response === 0) {
      await installUpdate(result.dmgUrl);
      return;
    }
    const openIndex = canInstall ? 1 : 0;
    if (answer.response === openIndex && result.url) await shell.openExternal(result.url);
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: 'Cannot check for updates',
      detail: String(error),
    });
  }
}

function buildTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Capture Area', accelerator: settings.shortcut, click: capture },
      { label: 'Settings…', click: openSettingsWindow },
      { label: 'Check for Updates…', click: () => void runUpdateCheck() },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: 'Quit', role: 'quit' },
    ])
  );
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 440,
    height: 410,
    resizable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:save', (_event, next) => {
  if (!registerShortcut(next.shortcut)) {
    registerShortcut(settings.shortcut);
    return { ok: false, error: `Cannot register shortcut: ${next.shortcut}` };
  }
  settings = { ...settings, ...next };
  saveSettings(settings);
  buildTrayMenu();
  return { ok: true };
});

ipcMain.handle('settings:choose-dir', async () => {
  const result = await dialog.showOpenDialog(settingsWindow, {
    defaultPath: settings.saveDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Screen Recording permission for the screencapture binary. In development
// the permission belongs to the terminal that launched npm start.
ipcMain.handle('permissions:get', () => ({
  screen: systemPreferences.getMediaAccessStatus('screen'),
}));

ipcMain.handle('permissions:open-screen-settings', () =>
  shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  )
);

ipcMain.handle('preview:save', (event) => savePreview(event.sender.id));
ipcMain.handle('preview:copy', (event) => copyPreview(event.sender.id));
ipcMain.handle('preview:close', (event) => closePreview(event.sender.id));
ipcMain.handle('preview:edit', (event) => openEditor(event.sender.id));

ipcMain.handle('editor:image', (event) => editorImage(event.sender.id));
ipcMain.handle('editor:save', (event, dataUrl) => saveEditor(event.sender.id, dataUrl));
ipcMain.handle('editor:close', (event) => closeEditor(event.sender.id));

app.whenReady().then(() => {
  // The editor's font picker reads the installed families through
  // queryLocalFonts. Nothing else in the app requests a permission, so
  // everything but that stays denied.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'local-fonts')
  );
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission) => permission === 'local-fonts'
  );

  // Drop update temp dirs left by a killed process. Failure is harmless.
  void cleanupTempDirs().catch(() => {});

  // menu bar app: no dock icon, no main window
  if (app.dock) app.dock.hide();

  // deliberate shortcut: emoji as the status bar icon, no image asset needed.
  // Swap for a 16pt template png if it ever renders poorly.
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📷');
  tray.setToolTip('akbun-screenshot');
  buildTrayMenu();

  registerShortcut(settings.shortcut);
});

// keep running in the menu bar after all windows close
app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
