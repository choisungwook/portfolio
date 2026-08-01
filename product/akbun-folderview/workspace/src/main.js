'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} = require('electron');
const fsPromises = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { fileKind, makeEntry, mergeScan } = require('./library');
const { dataDir, loadLibrary, loadSettings, saveLibrary, saveSettings } = require('./store');
const {
  checkUpdate,
  cleanupTempDirs,
  downloadInstaller,
  spawnSwap,
} = require('./update');

let library = { roots: [], entries: [] };
let settings = loadSettings();
let mainWindow = null;

// One window only. The updater relaunches the app while the installer may also
// be starting it, and Windows sends a second launch here instead of opening a
// duplicate window.
if (!app.requestSingleInstanceLock()) app.quit();

/* ---------------------------------------------------------------- scanning */

// stat gives the size and date the Properties panel shows. Chunked because a
// folder with ten thousand files would otherwise open ten thousand handles at
// once and hit the descriptor limit.
async function statChunked(paths) {
  const entries = [];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const stats = await Promise.all(
      chunk.map((filePath) => fsPromises.stat(filePath).catch(() => null))
    );
    chunk.forEach((filePath, index) => {
      const stat = stats[index];
      if (!stat) return;
      entries.push(makeEntry(filePath, { size: stat.size, mtime: stat.mtimeMs }));
    });
  }
  return entries;
}

// Walk one added folder and keep the photos and videos. Unreadable folders are
// skipped rather than failing the whole scan.
async function scanFolder(rootPath) {
  let dirents = [];
  try {
    dirents = await fsPromises.readdir(rootPath, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  const paths = dirents
    .filter((dirent) => dirent.isFile() && fileKind(dirent.name))
    .map((dirent) => path.join(dirent.parentPath ?? dirent.path, dirent.name));
  return statChunked(paths);
}

// Rescan every root and drop files that are gone from disk. Tags and ratings
// survive because mergeScan carries them over by path.
async function rescanAll() {
  const scanned = [];
  for (const root of library.roots) scanned.push(...(await scanFolder(root.path)));

  // Files added one by one are not under any root, so a rescan must keep them.
  const loose = library.entries.filter(
    (entry) => !library.roots.some((root) => entry.path.startsWith(root.path))
  );
  const stillThere = loose.filter((entry) => fs.existsSync(entry.path));

  library.entries = [...mergeScan(library.entries, scanned), ...stillThere];
  saveLibrary(library);
}

/* --------------------------------------------------------------- updating  */

// Guard so a second click cannot start an overlapping download.
let updating = false;

// Download the installer, start the script, quit. The installer replaces the
// app while nothing is holding the exe, and the script starts it again.
async function installUpdate(installerUrl) {
  updating = true;
  let installerPath = null;
  try {
    installerPath = await downloadInstaller(installerUrl);
    await spawnSwap(app.getPath('exe'), installerPath);
    app.quit();
  } catch (error) {
    // Clear the flag first. A throwing rm must not leave the menu item dead.
    updating = false;
    if (installerPath) {
      await fsPromises
        .rm(path.dirname(installerPath), { recursive: true, force: true })
        .catch(() => {});
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

    // Under npm start there is no installed copy to replace, so only the
    // release page is offered.
    const canInstall = app.isPackaged && result.installerUrl !== null;
    const buttons = canInstall
      ? ['Update Now', 'Open Release', 'Close']
      : ['Open Release', 'Close'];
    const detail = canInstall
      ? `Current version ${result.current}. Update Now downloads the installer, runs it, and starts the app again.`
      : `Current version ${result.current}. Download the installer from the release page.`;

    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Version ${result.latest} is available`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
    });

    if (canInstall && answer.response === 0) {
      await installUpdate(result.installerUrl);
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

/* ----------------------------------------------------------------- library */

function findEntry(filePath) {
  return library.entries.find((entry) => entry.path === filePath) ?? null;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function pushLibrary() {
  send('library:changed', { roots: library.roots, entries: library.entries });
}

async function addFolder() {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Folder',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return;

  const rootPath = picked.filePaths[0];
  if (!library.roots.some((root) => root.path === rootPath)) {
    library.roots.push({ path: rootPath });
  }
  const scanned = await scanFolder(rootPath);
  const known = new Set(library.entries.map((entry) => entry.path));
  const merged = mergeScan(library.entries, scanned);
  library.entries = [
    ...library.entries,
    ...merged.filter((entry) => !known.has(entry.path)),
  ];
  saveLibrary(library);
  pushLibrary();
}

async function addFiles() {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Photos and Videos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'tif', 'tiff', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg'] }],
  });
  if (picked.canceled) return;

  const known = new Set(library.entries.map((entry) => entry.path));
  const fresh = picked.filePaths.filter((filePath) => !known.has(filePath) && fileKind(filePath));
  library.entries.push(...(await statChunked(fresh)));
  saveLibrary(library);
  pushLibrary();
}

/* ---------------------------------------------------------------- IPC */

ipcMain.handle('library:get', () => ({
  roots: library.roots,
  entries: library.entries,
  settings,
  version: app.getVersion(),
  dataDir: dataDir(),
}));

ipcMain.handle('library:addFolder', () => addFolder());
ipcMain.handle('library:addFiles', () => addFiles());

ipcMain.handle('library:rescan', async () => {
  await rescanAll();
  pushLibrary();
});

// Removing a folder removes its files from the library. The files themselves
// are not touched.
ipcMain.handle('library:removeRoot', (_event, rootPath) => {
  library.roots = library.roots.filter((root) => root.path !== rootPath);
  library.entries = library.entries.filter((entry) => !entry.path.startsWith(rootPath));
  saveLibrary(library);
  pushLibrary();
});

ipcMain.handle('entry:update', (_event, filePath, patch) => {
  const entry = findEntry(filePath);
  if (!entry) return null;
  Object.assign(entry, patch);
  saveLibrary(library);
  return entry;
});

ipcMain.handle('entry:open', (_event, filePath) => shell.openPath(filePath));
ipcMain.handle('entry:reveal', (_event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('entry:copyPath', (_event, filePath) => clipboard.writeText(filePath));

ipcMain.handle('entry:rename', async (_event, filePath, newName) => {
  const entry = findEntry(filePath);
  if (!entry || !newName || newName === entry.name) return { ok: false };

  const target = path.join(path.dirname(filePath), newName);
  try {
    await fsPromises.rename(filePath, target);
  } catch (error) {
    return { ok: false, error: String(error) };
  }
  Object.assign(entry, { path: target, name: newName, _key: undefined });
  saveLibrary(library);
  pushLibrary();
  return { ok: true };
});

// Delete moves the file to the Recycle Bin rather than unlinking it, so a
// mis-click is recoverable outside this app.
ipcMain.handle('entry:delete', async (_event, filePath) => {
  const answer = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    message: 'Move this file to the Recycle Bin?',
    detail: filePath,
    buttons: ['Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (answer.response !== 0) return { ok: false };

  try {
    await shell.trashItem(filePath);
  } catch (error) {
    return { ok: false, error: String(error) };
  }
  library.entries = library.entries.filter((entry) => entry.path !== filePath);
  saveLibrary(library);
  pushLibrary();
  return { ok: true };
});

// The right click menu is a native menu, so it looks and behaves like the rest
// of the system. It resolves with the chosen action and the renderer runs it.
ipcMain.handle('entry:menu', (event) =>
  new Promise((resolve) => {
    const pick = (action) => () => resolve(action);
    const menu = Menu.buildFromTemplate([
      { label: 'Open', click: pick('open') },
      { label: 'Rename…', click: pick('rename') },
      { label: 'Delete', click: pick('delete') },
      { type: 'separator' },
      { label: 'Copy Path', click: pick('copyPath') },
      { label: 'Show in Folder', click: pick('reveal') },
      { type: 'separator' },
      { label: 'Properties', click: pick('properties') },
    ]);
    menu.popup({
      window: BrowserWindow.fromWebContents(event.sender),
      // Closing without a choice still has to settle the promise.
      callback: () => resolve(null),
    });
  })
);

ipcMain.handle('settings:save', (_event, next) => {
  settings = next;
  saveSettings(settings);
  applyTheme();
  return settings;
});

ipcMain.handle('settings:openDataDir', () => shell.openPath(dataDir()));
ipcMain.handle('update:check', () => runUpdateCheck());

/* ---------------------------------------------------------------- window */

function applyTheme() {
  nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;
}

function buildAppMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Add Folder…', accelerator: 'CmdOrCtrl+O', click: () => void addFolder() },
          { label: 'Add Files…', accelerator: 'CmdOrCtrl+Shift+O', click: () => void addFiles() },
          {
            label: 'Rescan Library',
            accelerator: 'F5',
            click: async () => {
              await rescanAll();
              pushLibrary();
            },
          },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings:open') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Search', accelerator: 'CmdOrCtrl+F', click: () => send('search:focus') },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Check for Updates…', click: () => void runUpdateCheck() },
          { label: `Version ${app.getVersion()}`, enabled: false },
        ],
      },
    ])
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    // Set here as well as in CSS so the window does not flash white on start.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1d' : '#f6f6f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  // Drop update temp dirs left by a killed process. Failure is harmless.
  void cleanupTempDirs().catch(() => {});

  library = loadLibrary();
  applyTheme();
  buildAppMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
