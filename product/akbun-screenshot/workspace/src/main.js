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
  shell,
  systemPreferences,
} = require('electron');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings');
const { captureArea, savePreview, deletePreview } = require('./capture');

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

function buildTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Capture Area', accelerator: settings.shortcut, click: capture },
      { label: 'Settings…', click: openSettingsWindow },
      { type: 'separator' },
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
    height: 330,
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
ipcMain.handle('preview:delete', (event) => deletePreview(event.sender.id));

app.whenReady().then(() => {
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
