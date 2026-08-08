'use strict';

(function () {

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
//
// Editing is one of the things that needs the desktop app now: the project
// lives in Rust, so there is nothing in the page for a command to change. The
// stub hands back an empty document every time, which is enough to lay the
// timeline out and not enough to mistake for a working editor.
if (!window.__TAURI__) {
  const unavailable = async () => {
    alert('This needs the desktop app.');
    return null;
  };
  const emptyDocument = () => ({
    project: {
      version: 2,
      settings: { width: 1920, height: 1080, rate: { num: 30, den: 1 } },
      assets: [],
      tracks: [
        { id: 't1', kind: 'video', name: 'V1', clips: [], muted: false, hidden: false },
        { id: 't2', kind: 'audio', name: 'A1', clips: [], muted: false, hidden: false },
      ],
    },
    revision: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
  });
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
        defaultRate: { num: 30, den: 1 },
        workspaceDir: '',
        ffmpegDir: '',
        renderAcceleration: 'auto',
        compositor: 'auto',
        proxyEnabled: true,
        logDir: '',
        logRotationSize: 5,
        logRotationUnit: 'mb',
      },
      workspace: '',
      version: '0.0.0-browser',
      dataDir: '',
      logDir: '',
      ffmpeg: null,
      ffprobe: null,
      acceleration: { available: null, tried: [] },
      compositor: { setting: 'auto', device: 'software (CPU)', gpu: false, fellBack: true },
      qualityProject: null,
      qualityReport: null,
      qualitySmoke: false,
    }),
    saveSettings: async (settings) => ({
      settings,
      workspace: settings.workspaceDir || '',
      version: '0.0.0-browser',
      dataDir: '',
      logDir: settings.logDir || '',
      ffmpeg: null,
      ffprobe: null,
      acceleration: { available: null, tried: [] },
      compositor: { setting: 'auto', device: 'software (CPU)', gpu: false, fellBack: true },
      qualityProject: null,
      qualityReport: null,
      qualitySmoke: false,
    }),
    pickMedia: unavailable,
    pickProjectOpen: unavailable,
    pickProjectSave: unavailable,
    pickRenderOutput: unavailable,
    pickFolder: unavailable,
    listProjects: async () => [],
    previewFrame: unavailable,
    // No native monitor in a plain browser, so the page keeps the media
    // element preview. Reported as the setting rather than as a fallback: in a
    // browser there was never a graphics surface to lose.
    playbackAttach: async () => ({ engine: 'media-element', fellBack: null, status: null }),
    playbackRelease: async () => {},
    playbackPlay: async () => null,
    playbackPause: async () => null,
    playbackSeek: async () => null,
    playbackRedraw: async () => null,
    playbackPlace: async () => null,
    playbackVisible: async () => null,
    playbackStatus: async () => null,
    processMemoryBytes: async () =>
      performance.memory && performance.memory.usedJSHeapSize
        ? performance.memory.usedJSHeapSize
        : null,
    saveQualityReport: async () => null,
    writeQualityReport: async () => null,
    // Pretends the folder was made, the way saveProject below pretends the
    // file was written, so the New Project flow can be walked in a browser.
    createProject: async (name) => ({
      name,
      dir: `/workspace/${name}`,
      path: `/workspace/${name}/project.akbunvideo`,
      modifiedMs: 0,
    }),
    deleteProject: unavailable,
    importAssets: async () => [],
    proxyStatus: async () => [],
    startProxies: async () => [],
    editState: async () => emptyDocument(),
    editApply: async () => emptyDocument(),
    editUndo: async () => emptyDocument(),
    editRedo: async () => emptyDocument(),
    describeAsset: async () => emptyDocument(),
    newDocument: async () => emptyDocument(),
    openProject: unavailable,
    saveProject: async () => {},
    startRender: unavailable,
    cancelRender: async () => {},
    fileUrl: (path) => path,
    onRenderProgress: () => {},
    onRenderDone: () => {},
    onRenderFallback: () => {},
    onProxyStatus: () => {},
    onFileDrop: () => {},
    message: async (text) => alert(text),
    ask: async (text) => confirm(text),
    setTitle: (title) => {
      document.title = title;
    },
    onCloseRequested: () => {},
    closeWindow: () => {},
    checkUpdate: async () => {},
    reportError: async (source, text) => console.error(source, text),
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
    invoke('report_error', { source: 'update:check', message: String(error) }).catch((logError) => {
      console.error('error-log', logError);
    });
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
  reportError: (source, message) => invoke('report_error', { source, message }),

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
  // No project goes with the request: the compositor reads the document, which
  // is the same copy the render will read.
  previewFrame: async (frame, maxWidth) => {
    const raw = await invoke('preview_frame', { frame, maxWidth });
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(0, true),
      height: view.getUint32(4, true),
      pixels: bytes.subarray(8),
    };
  },
  // The native monitor. Transport commands and a position come back over this;
  // frames never do. See wiki/architecture/viewport.md.
  playbackAttach: (place, frame) => invoke('playback_attach', { place, frame }),
  playbackRelease: () => invoke('playback_release'),
  playbackPlay: () => invoke('playback_play'),
  playbackPause: () => invoke('playback_pause'),
  playbackSeek: (frame) => invoke('playback_seek', { frame }),
  playbackRedraw: () => invoke('playback_redraw'),
  playbackPlace: (place) => invoke('playback_place', { place }),
  playbackVisible: (visible) => invoke('playback_visible', { visible }),
  playbackStatus: () => invoke('playback_status'),
  processMemoryBytes: () => invoke('process_memory_bytes'),
  saveQualityReport: async (report) => {
    const path = await saveDialog({
      title: 'Save Playback Quality Report',
      defaultPath: 'media-element-baseline.json',
      filters: [{ name: 'JSON report', extensions: ['json'] }],
    });
    if (!path) return null;
    await invoke('save_quality_report', { path, report });
    return path;
  },
  writeQualityReport: (path, report) => invoke('save_quality_report', { path, report }),
  createProject: (name) => invoke('create_project', { name }),
  deleteProject: (projectPath) => invoke('delete_project', { projectPath }),

  // Only paths cross this line. Nothing here copies a byte of media, and
  // importing does not change the project on its own: it reports what the
  // files are, and the page decides what to do about it with a command.
  importAssets: (paths) => invoke('import_assets', { paths }),
  proxyStatus: () => invoke('proxy_status'),
  startProxies: (projectPath) => invoke('start_proxies', { projectPath }),

  // The edit. Every one of these hands back the whole document state, and the
  // page draws that rather than its own idea of what just happened.
  editState: () => invoke('edit_state'),
  // A list, applied as one undo step: dropping three files is one thing the
  // user did, so it takes one press to take back.
  editApply: (commands) => invoke('edit_apply', { commands }),
  editUndo: () => invoke('edit_undo'),
  editRedo: () => invoke('edit_redo'),
  describeAsset: (assetId, durationMs, width, height) =>
    invoke('describe_asset', { assetId, durationMs, width, height }),
  newDocument: () => invoke('new_document'),

  openProject: (path) => invoke('open_project', { path }),
  saveProject: (path) => invoke('save_project', { path }),
  startRender: (path, preset) => invoke('start_render', { path, preset }),
  cancelRender: () => invoke('cancel_render'),

  // file:// will not load in the webview; this is what the asset protocol
  // needs. The path also has to have been granted a scope in Rust first.
  fileUrl: (path) => convertFileSrc(path),

  onRenderProgress: (handler) => listen('render:progress', (event) => handler(event.payload)),
  onRenderDone: (handler) => listen('render:done', (event) => handler(event.payload)),
  // The hardware encoder failed on this file and the CPU is taking over.
  onRenderFallback: (handler) => listen('render:fallback', (event) => handler(event.payload)),
  onProxyStatus: (handler) => listen('proxy:status', (event) => handler(event.payload)),
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

function pageErrorText(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function reportPageError(error, source) {
  window.api.reportError(source, pageErrorText(error)).catch((logError) => {
    console.error('error-log', logError);
  });
}

window.addEventListener('error', (event) => {
  reportPageError(event.error || event.message, 'page');
});
window.addEventListener('unhandledrejection', (event) => {
  reportPageError(event.reason, 'page:promise');
});
})();
