'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { nextState, spacerTitles, controlTitle } = require('./sections');
const { listMenuBarItems } = require('./menubar');
const { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } = require('./update');

let state = 'collapsed';
let control = null;
let hiddenSpacer = null;
let alwaysHiddenSpacer = null;
let itemsWindow = null;

function screenWidth() {
  return screen.getPrimaryDisplay().size.width;
}

function applyState() {
  const titles = spacerTitles(state, screenWidth());
  hiddenSpacer.setTitle(titles.hidden);
  alwaysHiddenSpacer.setTitle(titles.alwaysHidden);
  control.setTitle(controlTitle(state));
  control.setToolTip(`akbun-mactaskbar: ${state}`);
}

function cycleState() {
  state = nextState(state);
  applyState();
  if (itemsWindow) itemsWindow.webContents.send('sections:state', state);
}

function openItemsWindow() {
  if (itemsWindow) {
    itemsWindow.show();
    itemsWindow.focus();
    return;
  }
  itemsWindow = new BrowserWindow({
    width: 460,
    height: 560,
    title: 'Menu Bar Items',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  itemsWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  itemsWindow.on('closed', () => {
    itemsWindow = null;
  });
}

// The bundle is three levels up from the executable inside Contents/MacOS.
function appBundlePath() {
  return path.resolve(app.getPath('exe'), '../../..');
}

// Blocks a second update run while a download or swap is in flight.
let updating = false;

// Downloads the dmg, starts the swap script and quits. The script relaunches
// the app. A failure before the script starts removes the dmg here; after it
// starts the script's own trap owns cleanup.
async function installUpdate(dmgUrl) {
  updating = true;
  let dmgPath = null;
  try {
    dmgPath = await downloadDmg(dmgUrl);
    await spawnSwap(appBundlePath(), dmgPath);
    app.quit();
  } catch (error) {
    if (dmgPath) await fs.rm(path.dirname(dmgPath), { recursive: true, force: true });
    updating = false;
    await dialog.showMessageBox({
      type: 'error',
      message: 'Update install failed',
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
        message: 'Already on the latest version',
        detail: `Current version ${result.current}`,
      });
      return;
    }

    // Under npm start the bundle to replace is Electron.app, so installing is
    // only offered from a packaged build.
    const canInstall = app.isPackaged && result.dmgUrl !== null;
    const buttons = canInstall
      ? ['Update now', 'Open release', 'Close']
      : ['Open release', 'Close'];
    const detail = canInstall
      ? `Current version ${result.current}. Update now downloads the dmg, replaces the app and relaunches it.`
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

function contextMenu() {
  return Menu.buildFromTemplate([
    { label: 'Menu Bar Items…', click: openItemsWindow },
    { label: 'Check for Updates…', click: () => void runUpdateCheck() },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

// A spacer is a status item with no icon whose title is a run of spaces. The
// width of that title is the whole mechanism, so nothing else is configured.
function createSpacer() {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('');
  return tray;
}

ipcMain.handle('menubar:list', () => listMenuBarItems(screenWidth()));
ipcMain.handle('sections:get', () => state);
ipcMain.handle('sections:cycle', () => {
  cycleState();
  return state;
});

app.whenReady().then(() => {
  // Menu bar app: no dock icon, no main window.
  if (app.dock) app.dock.hide();

  // Creation order sets the default left to right order, newest leftmost:
  // [always-hidden spacer] [hidden spacer] [control].
  control = new Tray(nativeImage.createEmpty());
  hiddenSpacer = createSpacer();
  alwaysHiddenSpacer = createSpacer();

  control.on('click', cycleState);
  control.on('right-click', () => control.popUpContextMenu(contextMenu()));
  applyState();

  void cleanupTempDirs();
});

// Keep running in the menu bar after the items window closes.
app.on('window-all-closed', () => {});
