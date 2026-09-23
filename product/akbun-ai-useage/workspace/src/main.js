'use strict';

const { app, Menu, Tray, dialog, nativeImage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { collect } = require('./collect');
const { formatTitle, sectionLines } = require('./format');
const { loadSettings } = require('./settings');
const { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } = require('./update');

let tray = null;
let timer = null;
let refreshing = false;
let sections = [];
let lastRefresh = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// macOS shows text next to an empty image. Windows and Linux trays cannot show
// text, so they get a 16x16 dot drawn in code and the summary as a tooltip.
function trayIcon() {
  if (process.platform === 'darwin') return nativeImage.createEmpty();
  const size = 16;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - 7.5) ** 2 + (y - 7.5) ** 2 > 49) continue;
      pixels.set([0xd9, 0x77, 0x57, 0xff], (y * size + x) * 4);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

function appBundlePath() {
  return path.resolve(app.getPath('exe'), '../../..');
}

let updating = false;

async function installUpdate(dmgUrl) {
  updating = true;
  let dmgPath = null;
  try {
    dmgPath = await downloadDmg(dmgUrl);
    await spawnSwap(appBundlePath(), dmgPath);
    app.quit();
  } catch (error) {
    updating = false;
    if (dmgPath) {
      await fs.rm(path.dirname(dmgPath), { recursive: true, force: true }).catch(() => {});
    }
    await dialog.showMessageBox({ type: 'error', message: 'Update failed', detail: String(error) });
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

    // Only a packaged macOS build has a dmg to swap in. Everything else gets the release page.
    const canInstall = app.isPackaged && process.platform === 'darwin' && result.dmgUrl !== null;
    const buttons = canInstall ? ['Update Now', 'Open Release', 'Close'] : ['Open Release', 'Close'];
    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Version ${result.latest} is available`,
      detail: canInstall
        ? `Current version ${result.current}. Update Now downloads the dmg, replaces the app, and relaunches it.`
        : `Current version ${result.current}. Download the new build from the release page.`,
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
    await dialog.showMessageBox({ type: 'error', message: 'Cannot check for updates', detail: String(error) });
  }
}

function buildMenu() {
  const now = Date.now();
  const items = [];
  for (const section of sections) {
    items.push({ label: section.name, enabled: false });
    for (const line of sectionLines(section, now)) items.push({ label: `   ${line}`, enabled: false });
    items.push({ type: 'separator' });
  }
  if (!sections.length) items.push({ label: 'No source enabled', enabled: false }, { type: 'separator' });

  const updated = lastRefresh ? `Updated ${new Date(lastRefresh).toLocaleTimeString()}` : 'Loading…';
  items.push(
    { label: updated, enabled: false },
    { label: 'Refresh Now', click: () => void refresh() },
    { label: 'Open Settings File…', click: () => void shell.openPath(settingsPath()) },
    { label: 'Check for Updates…', click: () => void runUpdateCheck() },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Quit', role: 'quit' }
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function schedule(minutes) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), Math.max(1, minutes) * 60 * 1000);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const settings = loadSettings(settingsPath());
  try {
    sections = await collect(settings);
    lastRefresh = Date.now();
    const title = formatTitle(sections);
    if (process.platform === 'darwin') tray.setTitle(title);
    tray.setToolTip(`akbun-ai-useage\n${title}`);
    buildMenu();
  } finally {
    refreshing = false;
    schedule(settings.refreshMinutes);
  }
}

app.whenReady().then(() => {
  void cleanupTempDirs().catch(() => {});
  if (app.dock) app.dock.hide();

  tray = new Tray(trayIcon());
  if (process.platform === 'darwin') tray.setTitle('AI …');
  tray.setToolTip('akbun-ai-useage');
  buildMenu();
  void refresh();
});

app.on('window-all-closed', () => {});
