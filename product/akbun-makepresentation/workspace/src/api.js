'use strict';

// The only bridge between the page and the operating system.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs
// no bundler and the app keeps its no-build-step property. The pickers run in
// the page rather than in Rust: a blocking native dialog inside a command is
// a threading hazard, and this way each command receives a path and does one
// job.

// Opening src/index.html in a plain browser is handy for poking at the
// editor itself, so without Tauri the file operations degrade to no-ops
// instead of the whole page dying on the first line.
if (!window.__TAURI__) {
  const unavailable = () => {
    alert('File operations need the desktop app.');
    return null;
  };
  window.api = {
    pickOpen: unavailable,
    pickSave: unavailable,
    openDeck: async () => null,
    saveDeck: async () => {},
    exportPdf: async () => {},
    savePng: async () => {},
    listSystemFonts: async () => ['Arial', 'Helvetica'],
    message: async (text) => alert(text),
    ask: async (text) => confirm(text),
    setTitle: (title) => {
      document.title = title;
    },
    setFullscreen: async (enabled) => {
      if (enabled) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    },
    onFullscreenChanged: (handler) => {
      const listener = () => handler(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', listener);
      return () => document.removeEventListener('fullscreenchange', listener);
    },
    onGuidelinesChanged: () => Promise.resolve(() => {}),
    onFileCommand: () => Promise.resolve(() => {}),
    checkUpdate: async () => {},
  };
  throw new Error('not running under Tauri; using the browser fallback api');
}

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open: openDialog, save: saveDialog, message, ask } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const currentWindow = getCurrentWindow();

async function checkUpdate() {
  const { check } = window.__TAURI__.updater;
  const { relaunch } = window.__TAURI__.process;
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'akbun-makepresentation' });
      return;
    }
    const install = await ask(
      `Version ${update.version} is available. Download and install it now?`,
      { title: 'Update available', kind: 'info' }
    );
    if (!install) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    await message(`Cannot check for updates.\n\n${error}`, {
      title: 'Update failed',
      kind: 'error',
    });
  }
}

window.api = {
  pickOpen: () =>
    openDialog({
      title: 'Open Deck',
      filters: [{ name: 'Slide Deck', extensions: ['pptx'] }],
    }),

  pickSave: (defaultName, extension) =>
    saveDialog({
      title: 'Save',
      defaultPath: defaultName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    }),

  openDeck: (path) => invoke('open_deck', { path }),
  saveDeck: (path, deck) => invoke('save_deck', { path, deck }),
  exportPdf: (path, pages) => invoke('export_pdf', { path, pages }),
  savePng: (path, dataUrl) => invoke('save_png', { path, dataUrl }),
  listSystemFonts: () => invoke('list_system_fonts'),

  message: (text, opts) => message(text, opts),
  ask: (text, opts) => ask(text, opts),
  setTitle: (title) => currentWindow.setTitle(title),
  setFullscreen: (enabled) => currentWindow.setFullscreen(enabled),
  onFullscreenChanged: (handler) =>
    currentWindow.onResized(async () => handler(await currentWindow.isFullscreen())),
  onGuidelinesChanged: (handler) =>
    listen('guidelines-changed', (event) => handler(!!event.payload)),
  onFileCommand: (handler) =>
    listen('file-command', (event) => handler(event.payload)),
  checkUpdate,
};
