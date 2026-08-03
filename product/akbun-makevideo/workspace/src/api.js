'use strict';

// The only bridge between the page and the operating system.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs no
// bundler and the app keeps its no-build-step property. The pickers run in the
// page rather than in Rust: a blocking native dialog inside a command is a
// threading hazard, and this way each command receives a path and does one job.

const MEDIA_FILTERS = [
  {
    name: 'Media',
    extensions: [
      'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi',
      'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg',
      'png', 'jpg', 'jpeg', 'gif', 'webp',
    ],
  },
];

const PROJECT_FILTERS = [{ name: 'akbun-makevideo project', extensions: ['akbunvideo'] }];

// Opening src/index.html in a plain browser is handy for poking at the layout,
// so without Tauri everything that needs the desktop app degrades to a no-op
// instead of the whole page dying on the first line.
if (!window.__TAURI__) {
  const unavailable = async () => {
    alert('This needs the desktop app.');
    return null;
  };
  window.api = {
    available: false,
    bootstrap: async () => ({
      settings: {
        theme: 'system',
        previewQuality: 'half',
        previewMuteWhileScrubbing: true,
        snap: true,
        defaultWidth: 1920,
        defaultHeight: 1080,
        defaultFps: 30,
        workspaceDir: '',
        ffmpegDir: '',
        renderAcceleration: 'auto',
        compositor: 'auto',
      },
      workspace: '',
      version: '0.0.0-browser',
      dataDir: '',
      ffmpeg: null,
      ffprobe: null,
      acceleration: { available: null, tried: [] },
      compositor: { setting: 'auto', device: 'software (CPU)', gpu: false, fellBack: true },
    }),
    saveSettings: async (settings) => ({
      settings,
      workspace: settings.workspaceDir || '',
      version: '0.0.0-browser',
      dataDir: '',
      ffmpeg: null,
      ffprobe: null,
      acceleration: { available: null, tried: [] },
      compositor: { setting: 'auto', device: 'software (CPU)', gpu: false, fellBack: true },
    }),
    pickMedia: unavailable,
    pickProjectOpen: unavailable,
    pickProjectSave: unavailable,
    pickRenderOutput: unavailable,
    pickFolder: unavailable,
    listProjects: async () => [],
    previewFrame: unavailable,
    // Pretends the folder was made, the way saveProject below pretends the
    // file was written, so the New Project flow can be walked in a browser.
    createProject: async (name) => ({
      name,
      dir: `/workspace/${name}`,
      path: `/workspace/${name}/project.akbunvideo`,
      modifiedMs: 0,
    }),
    importAssets: async () => [],
    openProject: unavailable,
    saveProject: async () => {},
    startRender: unavailable,
    cancelRender: async () => {},
    fileUrl: (path) => path,
    onRenderProgress: () => {},
    onRenderDone: () => {},
    onRenderFallback: () => {},
    onFileDrop: () => {},
    message: async (text) => alert(text),
    ask: async (text) => confirm(text),
    setTitle: (title) => {
      document.title = title;
    },
    onCloseRequested: () => {},
    closeWindow: () => {},
    checkUpdate: async () => {},
  };
  throw new Error('not running under Tauri; using the browser fallback api');
}

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { open: openDialog, save: saveDialog, message, ask } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const { getCurrentWebview } = window.__TAURI__.webview;
const { listen } = window.__TAURI__.event;

async function checkUpdate() {
  const { check } = window.__TAURI__.updater;
  const { relaunch } = window.__TAURI__.process;
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'akbun-makevideo' });
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

/// Tauri has been known to deliver one drop as two events with different ids,
/// so the same paths arriving twice in quick succession are ignored. Importing
/// twice is harmless because assets are keyed by path, but the second event
/// would drop a second copy of every clip on the timeline.
function dedupeDrops(handler) {
  let lastKey = '';
  let lastAt = 0;
  return (event) => {
    const payload = event.payload || {};
    if (payload.type !== 'drop') {
      handler(payload);
      return;
    }
    const key = (payload.paths || []).join('\n');
    const now = performance.now();
    if (key === lastKey && now - lastAt < 400) return;
    lastKey = key;
    lastAt = now;
    handler(payload);
  };
}

window.api = {
  available: true,

  bootstrap: () => invoke('bootstrap'),
  saveSettings: (settings) => invoke('save_settings', { settings }),

  pickMedia: () =>
    openDialog({ title: 'Import Media', multiple: true, filters: MEDIA_FILTERS }),
  pickProjectOpen: () =>
    openDialog({ title: 'Open Project', filters: PROJECT_FILTERS }),
  pickProjectSave: (defaultName) =>
    saveDialog({ title: 'Save Project', defaultPath: defaultName, filters: PROJECT_FILTERS }),
  pickRenderOutput: (defaultName) =>
    saveDialog({
      title: 'Render To',
      defaultPath: defaultName,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    }),

  pickFolder: (title) => openDialog({ title, directory: true, multiple: false }),

  listProjects: () => invoke('list_projects'),
  // Raw RGBA, not an encoded image: this frame exists to show exactly what the
  // render will contain, and a lossy hop to the screen would undo that. The
  // first eight bytes are the width and height.
  previewFrame: async (project, timeMs, maxWidth) => {
    const raw = await invoke('preview_frame', { project, timeMs, maxWidth });
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(0, true),
      height: view.getUint32(4, true),
      pixels: bytes.subarray(8),
    };
  },
  createProject: (name) => invoke('create_project', { name }),

  // Only paths cross this line. Nothing here copies a byte of media.
  importAssets: (paths) => invoke('import_assets', { paths }),
  openProject: (path) => invoke('open_project', { path }),
  saveProject: (path, project) => invoke('save_project', { path, project }),
  startRender: (path, project, preset) => invoke('start_render', { path, project, preset }),
  cancelRender: () => invoke('cancel_render'),

  // file:// will not load in the webview; this is what the asset protocol
  // needs. The path also has to have been granted a scope in Rust first.
  fileUrl: (path) => convertFileSrc(path),

  onRenderProgress: (handler) => listen('render:progress', (event) => handler(event.payload)),
  onRenderDone: (handler) => listen('render:done', (event) => handler(event.payload)),
  // The hardware encoder failed on this file and the CPU is taking over.
  onRenderFallback: (handler) => listen('render:fallback', (event) => handler(event.payload)),
  onFileDrop: (handler) => getCurrentWebview().onDragDropEvent(dedupeDrops(handler)),

  message: (text, options) => message(text, options),
  ask: (text, options) => ask(text, options),
  setTitle: (title) => getCurrentWindow().setTitle(title),
  // Closing the window is the one way to lose an edit without being asked, so
  // the page takes the event over and calls destroy() once it is happy.
  onCloseRequested: (handler) => getCurrentWindow().onCloseRequested(handler),
  closeWindow: () => getCurrentWindow().destroy(),
  checkUpdate,
};
