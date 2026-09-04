'use strict';

(function () {

// The DOM. Everything that plays lives in preview.js and the arithmetic a
// redraw needs lives in timeline.js; this file listens, sends commands, and
// redraws from what comes back.
//
// It owns no part of the project. Every change goes through `edit()` below,
// which is one round trip to Rust, and what it hands back is what gets drawn —
// including when Rust decided something different from what was asked for,
// which is the normal case for a drop onto an occupied stretch of track.
//
// The exception is a drag in progress. A clip being dragged is moved by
// setting its element's own left and width, with no command sent and nothing
// asked, right up until the pointer comes up. That is the whole reason the
// arithmetic in timeline.js still exists.

const L = globalThis.timelineLib;
const T = globalThis.timeLib;
const K = globalThis.shortcutLib;
const X = globalThis.transformLib;
const G = globalThis.guideLib;
const S = globalThis.sourceLib;
const I = globalThis.inspectorLib;
const P = globalThis.panelLib;

// Pointer distance from a clip edge that starts a trim instead of a move.
const HANDLE_PX = 8;
// How near an edge has to be before the magnet takes it, in pixels rather than
// frames so it feels the same at every zoom.
const SNAP_PX = 10;
// How much timeline is kept past the end of the edit, so there is always
// somewhere to drop the next clip.
const TAIL_SECONDS = 10;

const DEFAULT_SETTINGS = {
  theme: 'system',
  previewQuality: 'quarter',
  previewMuteWhileScrubbing: true,
  snap: true,
  defaultWidth: 1920,
  defaultHeight: 1080,
  defaultRate: { num: 30, den: 1 },
  workspaceDir: '',
  ffmpegDir: '',
  renderAcceleration: 'auto',
  // Deliberately not a value the setting can hold. Before bootstrap answers
  // there is no IPC to attach a monitor over, and the first attach is triggered
  // by this differing from whatever Rust sends back — which it always does.
  // A real default here would mean a settings file holding that same value
  // never attaches at all.
  compositor: '',
  gpuDevice: '',
  proxyEnabled: true,
  showActionSafeArea: false,
  showTitleSafeArea: false,
  showRuleOfThirds: false,
  showCenterLines: false,
  deleteProjectFolder: true,
  logDir: '',
  logRotationSize: 5,
  logRotationUnit: 'mb',
  shortcutOverrides: {},
};

const el = (id) => document.getElementById(id);

const dom = {
  menus: el('menus'),
  upper: el('upper'),
  globalActions: el('global-actions'),
  selectedPanel: el('selected-panel'),
  selectedPanelTitle: el('selected-panel-title'),
  panelTabBar: el('panel-tab-bar'),
  inspectorView: el('inspector-view'),
  shapeToolView: el('shape-tool-view'),
  markerToolView: el('marker-tool-view'),
  toolWarning: el('tool-warning'),
  playbackWarning: el('playback-warning'),
  assetList: el('asset-list'),
  assetEmpty: el('asset-empty'),
  assetsPanel: el('assets-panel'),
  btnImport: el('btn-import'),
  sourcePanel: el('source-panel'),
  sourceStageWrap: el('source-stage-wrap'),
  sourceStage: el('source-stage'),
  sourceStageInner: el('source-stage-inner'),
  sourceHint: el('source-hint'),
  sourcePlay: el('source-play'),
  sourceClock: el('source-clock'),
  sourceDuration: el('source-duration'),
  sourceMarkIn: el('source-mark-in'),
  sourceMarkOut: el('source-mark-out'),
  sourceSeek: el('source-seek'),
  sourceMarkerLayer: el('source-marker-layer'),
  sourceBeforeRange: el('source-before-range'),
  sourceAfterRange: el('source-after-range'),
  sourceInMarker: el('source-in-marker'),
  sourceOutMarker: el('source-out-marker'),
  sourceRange: el('source-range'),
  sourceVideo: el('source-video'),
  sourceAudio: el('source-audio'),
  sourceRipple: el('source-ripple'),
  sourceInsert: el('source-insert'),
  sourceOverwrite: el('source-overwrite'),
  sourceAppend: el('source-append'),
  debugPanel: el('debug-view'),
  debugMetrics: el('debug-metrics'),
  debugLog: el('debug-log'),
  btnRefreshDebug: el('btn-refresh-debug'),
  btnToggleLogs: el('btn-toggle-logs'),
  stageWrap: el('stage-wrap'),
  stage: el('stage'),
  stageInner: el('stage-inner'),
  stageExact: el('stage-exact'),
  stageVisuals: el('stage-visuals'),
  stageOverlay: el('stage-overlay'),
  stageMode: el('stage-mode'),
  stageHint: el('stage-hint'),
  btnPlay: el('btn-play'),
  clock: el('clock'),
  duration: el('duration'),
  previewQuality: el('preview-quality'),
  btnSplit: el('btn-split'),
  btnMagnet: el('btn-magnet'),
  btnDelete: el('btn-delete'),
  btnRipple: el('btn-ripple'),
  btnLink: el('btn-link'),
  btnAddText: el('btn-add-text'),
  shapeButtons: [...document.querySelectorAll('[data-add-shape]')],
  btnAddMarker: el('btn-add-marker'),
  btnAddVideo: el('btn-add-video'),
  btnAddAudio: el('btn-add-audio'),
  btnAddSubtitle: el('btn-add-subtitle'),
  btnImportSrt: el('btn-import-srt'),
  btnExportSrt: el('btn-export-srt'),
  zoom: el('zoom'),
  proxyProgress: el('proxy-progress'),
  timeline: el('timeline'),
  heads: el('timeline-heads'),
  scroll: el('timeline-scroll'),
  content: el('timeline-content'),
  ruler: el('ruler'),
  markerList: el('marker-list'),
  markerEmpty: el('marker-empty'),
  inspectorEmpty: el('inspector-empty'),
  transformPanel: el('transform-panel'),
  transformX: el('transform-x'),
  transformY: el('transform-y'),
  transformWidth: el('transform-width'),
  transformHeight: el('transform-height'),
  transformRotation: el('transform-rotation'),
  transformOpacity: el('transform-opacity'),
  transformOpacityValue: el('transform-opacity-value'),
  clipPanel: el('clip-panel'),
  clipSummary: el('clip-summary'),
  clipVideoPanel: el('clip-video-panel'),
  clipAudioPanel: el('clip-audio-panel'),
  clipOpacity: el('clip-opacity'),
  clipVolume: el('clip-volume'),
  fontOptions: el('font-options'),
  textPanel: el('text-panel'),
  textValue: el('text-value'),
  textFont: el('text-font'),
  textSize: el('text-size'),
  textFillKind: el('text-fill-kind'),
  textColor: el('text-color'),
  textFillEndColor: el('text-fill-end-color'),
  textFillAsset: el('text-fill-asset'),
  textAddFill: el('text-add-fill'),
  textRemoveFill: el('text-remove-fill'),
  textAlign: el('text-align'),
  textStrokeColor: el('text-stroke-color'),
  textStrokeWidth: el('text-stroke-width'),
  textShadowColor: el('text-shadow-color'),
  textShadowEnabled: el('text-shadow-enabled'),
  textShadowX: el('text-shadow-x'),
  textShadowY: el('text-shadow-y'),
  textShadowBlur: el('text-shadow-blur'),
  shapePanel: el('shape-panel'),
  shapeKind: el('shape-kind'),
  shapeFillKind: el('shape-fill-kind'),
  shapeFill: el('shape-fill'),
  shapeFillEndColor: el('shape-fill-end-color'),
  shapeFillAsset: el('shape-fill-asset'),
  shapeAddFill: el('shape-add-fill'),
  shapeRemoveFill: el('shape-remove-fill'),
  shapeStroke: el('shape-stroke'),
  shapeStrokeWidth: el('shape-stroke-width'),
  shapeCornerRadius: el('shape-corner-radius'),
  shapeShadowEnabled: el('shape-shadow-enabled'),
  shapeShadowColor: el('shape-shadow-color'),
  shapeShadowX: el('shape-shadow-x'),
  shapeShadowY: el('shape-shadow-y'),
  shapeShadowBlur: el('shape-shadow-blur'),
  shapeStartArrow: el('shape-start-arrow'),
  shapeEndArrow: el('shape-end-arrow'),
  subtitlePanel: el('subtitle-panel'),
  subtitleValue: el('subtitle-value'),
  subtitleStart: el('subtitle-start'),
  subtitleEnd: el('subtitle-end'),
  subtitleFont: el('subtitle-font'),
  subtitleSize: el('subtitle-size'),
  subtitleColor: el('subtitle-color'),
  lanes: el('lanes'),
  timelineContextMenu: el('timeline-context-menu'),
  playhead: el('playhead'),
  renderOverlay: el('render-overlay'),
  renderTitle: el('render-title'),
  renderBar: el('render-bar'),
  renderStatus: el('render-status'),
  renderCancel: el('render-cancel'),
  renderClose: el('render-close'),
};

const state = {
  // What Rust last said the document is. `project` is the same object as
  // `doc.project`, kept under its own name because most of the page only cares
  // about the timeline and not about how many undo steps there are.
  doc: null,
  project: L.blankProject(),
  lutStatus: Object.create(null),
  // The revision the file on disk holds. Dirty is a comparison rather than a
  // flag, which means undoing back to where the last save was leaves the
  // project clean again instead of permanently modified.
  savedRevision: 0,
  settings: { ...DEFAULT_SETTINGS },
  boot: {
    settings: { ...DEFAULT_SETTINGS },
    workspace: '',
    version: '',
    dataDir: '',
    logDir: '',
    ffmpeg: null,
    ffprobe: null,
    acceleration: { available: null, tried: [] },
    compositor: { setting: 'gpu', device: 'initializing', gpu: false, fellBack: true },
    qualityProject: null,
    qualityReport: null,
    qualitySmoke: false,
  },
  path: null,
  waveforms: {},
  selectedClipId: null,
  selectedVisualItemId: null,
  activePanel: null,
  inspectorTab: 'video',
  selectedAssetId: null,
  sourceSelection: null,
  targetTrackId: null,
  pxPerSecond: 30,
  rendering: false,
  proxies: {},
  /// Why the native monitor is not running, when the setting asked for it.
  /// Shown next to the ffmpeg warning, because both mean the same thing to
  /// somebody using the app: a part of this is not working and here is why.
  playbackNotice: null,
};

let preview = null;
let mediaPreview = null;
let sourcePreview = null;
let qualityMonitor = null;
let stageResizeObserver = null;
let stageController = null;
let inspectorController = null;
let shortcutController = null;
let timelineInteractions = null;

const persistLatestSettings = globalThis.latestLib.createLatestPersistence({
  save: (settings) => window.api.saveSettings(settings),
  optimistic: (settings) => {
    // Every settings entry point contributes to the next full snapshot. A
    // toolbar click during a slow sheet save must not silently drop the sheet
    // fields simply because its backend answer is still pending.
    state.settings = { ...settings };
  },
  confirmed: () => state.boot,
  recover: () => window.api.bootstrap(),
  confirm: async (boot) => {
    state.boot = boot;
    await applySettings(boot.settings);
    updateToolWarning();
  },
  restore: (boot) => {
    state.boot = boot;
    return applySettings(boot.settings);
  },
  fail: async (error) => {
    reportError(error, 'settings:persist');
    await window.api.message(`That setting could not be saved.\n\n${error}`, {
      title: 'Settings',
      kind: 'error',
    });
  },
});

function setRuntime(runtime) {
  preview = runtime.preview;
  mediaPreview = runtime.mediaPreview;
  sourcePreview = runtime.sourcePreview;
  qualityMonitor = runtime.qualityMonitor;
  stageController = runtime.stageController;
  inspectorController = runtime.inspectorController;
  shortcutController = runtime.shortcutController;
  timelineInteractions = runtime.timelineInteractions;
  stageResizeObserver = runtime.stageResizeObserver;
}

// --- helpers ---------------------------------------------------------------

function errorText(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function reportError(error, source) {
  const message = errorText(error);
  console.error(source, error);
  Promise.resolve(window.api.reportError(source, message)).catch((logError) => {
    console.error('error-log', logError);
  });
}

function baseName(path) {
  return String(path).split(/[\\/]/).pop();
}

function stem(path) {
  return baseName(path).replace(/\.[^.]+$/, '');
}

/** The folder the project lives in, which is also where a render defaults to. */
function projectDir() {
  if (!state.path) return null;
  const cut = state.path.replace(/[\\/][^\\/]+$/, '');
  return cut === state.path ? null : cut;
}

/** A project made here is `<workspace>/<name>/project.akbunvideo`, so the name
 *  is the folder. A stray .akbunvideo opened through Browse is named by its
 *  file instead, because its folder is somebody else's. */
function projectName() {
  if (!state.path) return 'Untitled';
  const dir = projectDir();
  if (dir && baseName(state.path) === 'project.akbunvideo') return baseName(dir);
  return stem(state.path);
}

function zoomToPxPerSecond(value) {
  return 5 * Math.pow(1.04, Number(value));
}

/** The project timebase. Everything on this page is counted in frames of it. */
function rate() {
  return L.rateOf(state.project);
}

/** The magnet radius, which is a distance on screen rather than a number of
 *  frames. It stays fractional: snapping compares it against positions that are
 *  themselves fractional, so rounding it here would only make the radius drift
 *  from the ten pixels it is meant to be — by 5% at full zoom on 23.976, and
 *  further on any rate a future zoom range lands badly on. */
function snapTolerance() {
  if (!(state.settings && state.settings.snap)) return 0;
  return L.pxToFrames(SNAP_PX, rate(), state.pxPerSecond);
}

function isDirty() {
  return Boolean(state.doc) && state.doc.revision !== state.savedRevision;
}

function updateTitle() {
  const name = projectName();
  const mark = isDirty() ? ' •' : '';
  window.api.setTitle(`akbun-makevideo — ${name}${mark}`);
}

// --- sending edits ---------------------------------------------------------

/** Take on a document state Rust has just handed over. */
function adopt(doc) {
  state.doc = doc;
  state.project = doc.project;
}

/** Send commands as one undo step and redraw from the answer.
 *
 *  Nothing is applied here first. A command can be refused — a track that will
 *  not take that asset, a trim that would leave nothing of a clip — and a page
 *  that had already drawn the change would then have to work out how to take it
 *  back. Drawing only what came back means there is no such path: the timeline
 *  on screen is always a state Rust actually holds.
 *
 *  Returns the ids of any clips that appeared, because the caller usually wants
 *  to select what it just made and Rust is the one that named it, or null when
 *  the edit was refused. */
async function edit(...commands) {
  const sent = commands.filter(Boolean);
  if (!sent.length) return [];
  const before = new Set();
  for (const track of state.project.tracks) for (const clip of track.clips) before.add(clip.id);

  try {
    adopt(await window.api.editApply(sent));
  } catch (error) {
    // The document is untouched, so the page is the thing that is wrong. Take
    // the state back from Rust rather than guessing at what survived.
    adopt(await window.api.editState());
    refresh();
    await window.api.message(String(error), { title: 'That edit did not happen', kind: 'error' });
    return null;
  }

  const made = [];
  for (const track of state.project.tracks) {
    for (const clip of track.clips) if (!before.has(clip.id)) made.push(clip.id);
  }
  refresh();
  if (sent.some((command) => command.op === 'addAssets')) prepareDerivedMedia();
  return made;
}

/** One step back or forward. The selection is left alone: a clip that came
 *  back keeps its id, and one that went away is dropped by `liveSelection` the
 *  next time anything asks. */
async function stepHistory(which) {
  const doc = state.doc;
  if (!doc || (which === 'undo' ? !doc.canUndo : !doc.canRedo)) return;
  try {
    adopt(which === 'undo' ? await window.api.editUndo() : await window.api.editRedo());
  } catch (error) {
    adopt(await window.api.editState());
    refresh();
    await window.api.message(String(error), { title: 'History', kind: 'error' });
    return;
  }
  refresh();
}

const undoEdit = () => stepHistory('undo');
const redoEdit = () => stepHistory('redo');

function displayTracks() {
  // Video tracks read top down, so V1 is the bottom layer both on screen and
  // in the render. Audio hangs below them in its own order.
  return [...L.tracksOf(state.project, 'video')].reverse()
    .concat(L.tracksOf(state.project, 'subtitle'), L.tracksOf(state.project, 'audio'));
}

/** How many frames of timeline the ruler and the lanes are drawn for. */
function contentFrames() {
  const visible = L.pxToFrames(Math.max(dom.scroll.clientWidth, 320), rate(), state.pxPerSecond);
  const tail = Math.round(TAIL_SECONDS * T.rateToNumber(rate()));
  const markerEnd = (state.project.markers || []).reduce((end, marker) => Math.max(end, marker.frame), 0);
  return Math.max(L.projectDurationFrames(state.project) + tail, markerEnd + tail, visible);
}

function frameAtClientX(clientX) {
  const box = dom.content.getBoundingClientRect();
  return Math.max(0, L.pxToFrames(clientX - box.left, rate(), state.pxPerSecond));
}

// --- assets ----------------------------------------------------------------

function assetSummary(asset) {
  const bits = [asset.kind];
  if (asset.durationMs > 0) {
    bits.push(L.formatTimecode(T.framesFromMillis(asset.durationMs, rate()), rate()));
  }
  if (asset.width > 0) bits.push(`${asset.width}×${asset.height}`);
  if (asset.kind === 'video' && !asset.hasAudio) bits.push('silent');
  const proxy = state.proxies[asset.id];
  if (proxy) {
    if (proxy.state === 'original') bits.push(proxy.reason || 'original playback');
    else if (proxy.state === 'ready') bits.push(`proxy ready · ${proxy.reason}`);
    else if (proxy.state === 'failed') bits.push(`proxy failed · ${proxy.reason}`);
    else if (proxy.state === 'inspecting') bits.push(`proxy inspecting · ${proxy.reason}`);
    else if (proxy.state === 'waiting') bits.push(`proxy waiting · ${proxy.reason}`);
    else if (proxy.state === 'paused') bits.push(`proxy paused at ${proxy.percent || 0}% · ${proxy.reason}`);
    else bits.push(`proxy ${proxy.percent || 0}% · ${proxy.reason}`);
    if (proxy.message) bits.push(proxy.message);
  }
  return bits.join(' · ');
}

function playbackPath(asset) {
  if (!state.settings.proxyEnabled) return asset.path;
  const proxy = state.proxies[asset.id];
  return proxy && proxy.state === 'ready' && proxy.path ? proxy.path : asset.path;
}

function adoptProxyStatuses(statuses) {
  state.proxies = Object.fromEntries((statuses || []).map((status) => [status.assetId, status]));
  renderAssets();
  renderProxySummary();
  renderProxyProgress();
}

function proxySummary() {
  const statuses = Object.values(state.proxies);
  if (!state.path) return 'Save the project before creating proxies.';
  if (!statuses.length) return 'No video media to assess.';
  const candidates = statuses.filter((status) => status.state !== 'original');
  if (!candidates.length) return 'All video media can play directly.';
  const count = (name) => statuses.filter((status) => status.state === name).length;
  const ready = count('ready');
  const remaining = count('inspecting') + count('queued') + count('waiting') + count('generating') + count('paused');
  const held = count('waiting') + count('paused');
  const failed = count('failed');
  return [
    `${ready} ready`,
    remaining ? `${remaining} remaining` : '',
    held ? `${held} paused for playback` : '',
    failed ? `${failed} failed` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function renderProxySummary() {
  const summary = el('proxy-summary');
  if (summary) summary.textContent = proxySummary();
}

function renderProxyProgress() {
  const statuses = Object.values(state.proxies);
  const active = statuses.filter((status) =>
    ['inspecting', 'queued', 'waiting', 'generating', 'paused'].includes(status.state));
  if (!active.length) {
    dom.proxyProgress.hidden = true;
    return;
  }
  const held = active.filter((status) => status.state === 'waiting' || status.state === 'paused');
  const inspecting = active.filter((status) => status.state === 'inspecting');
  const percent = Math.round(active.reduce((total, status) => total + (status.percent || 0), 0) / active.length);
  dom.proxyProgress.textContent = held.length
    ? `Proxy paused for playback · ${active.length} remaining`
    : inspecting.length
      ? `Inspecting proxy media · ${active.length} remaining`
      : `Proxy ${percent}% · ${active.length} remaining`;
  dom.proxyProgress.hidden = false;
}

let debugTimer = null;
let debugRefreshInFlight = false;

function byteText(value) {
  if (!Number.isFinite(value)) return 'unavailable';
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function millisecondsText(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'unavailable';
}

function playbackDebugLines(status) {
  if (!status) return ['Native playback: not attached'];
  return [
    `Native frames: ${status.presented} presented, ${status.skipped} skipped, ${status.resynced} resynced`,
    `Native source: ${status.starved} starved, ${status.failedFrames} display failures`,
    `Native display call: ${millisecondsText(status.lastPresentMs)} last, ${millisecondsText(status.peakPresentMs)} peak`,
    `Native A/V lateness: ${millisecondsText(status.lastLateMs)} last, ${millisecondsText(status.peakLateMs)} peak`,
    `Native viewport: ${status.viewportGeometry || 'unavailable'}`,
  ];
}

function clipDragDebugLines() {
  const clipDragMetrics = timelineInteractions
    ? timelineInteractions.metrics
    : {};
  const text = (value) => Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'not measured';
  return [
    `Timeline drag next frame: ${text(clipDragMetrics.nextFrameMs)} last, ${text(clipDragMetrics.peakNextFrameMs)} peak`,
    `Timeline drag first move queue: ${text(clipDragMetrics.firstMoveQueueMs)} last, ${text(clipDragMetrics.peakFirstMoveQueueMs)} peak`,
  ];
}

async function refreshDebug() {
  if (dom.debugPanel.hidden || debugRefreshInFlight) return;
  debugRefreshInFlight = true;
  try {
    const [metrics, playback, logs] = await Promise.all([
      window.api.processMetrics(),
      window.api.playbackStatus(),
      dom.debugLog.hidden ? Promise.resolve(null) : window.api.readErrorLog(),
    ]);
    const active = Object.values(state.proxies).filter((status) =>
      ['inspecting', 'queued', 'waiting', 'generating', 'paused'].includes(status.state));
    dom.debugMetrics.textContent = [
      `Process tree CPU: ${Number.isFinite(metrics.cpuPercent) ? `${metrics.cpuPercent.toFixed(1)}%` : 'unavailable'}`,
      `Process tree memory: ${byteText(metrics.memoryBytes)}`,
      `Timeline: ${state.project.tracks.length} tracks, ${state.project.assets.length} assets`,
      `Proxy jobs: ${active.length} active, ${Object.keys(state.proxies).length} known`,
      `Compositor: ${state.settings.compositor || 'not read yet'}`,
      ...clipDragDebugLines(),
      ...playbackDebugLines(playback),
      `IPC proxy updates: percentage-throttled`,
    ].join('\n');
    if (logs !== null) dom.debugLog.textContent = logs || 'No error log entries.';
  } catch (error) {
    reportError(error, 'debug:refresh');
    dom.debugMetrics.textContent = `Debug data unavailable\n${errorText(error)}`;
  } finally {
    debugRefreshInFlight = false;
  }
}

function startDebug() {
  void refreshDebug();
  if (debugTimer === null) debugTimer = window.setInterval(() => void refreshDebug(), 1000);
}

function stopDebug() {
  if (debugTimer !== null) window.clearInterval(debugTimer);
  debugTimer = null;
}

const PANEL_TITLES = {
  inspector: 'Inspector',
  shape: 'Shape',
  marker: 'Marker',
  debug: 'Debug',
};

function activateSelectedPanel(panel) {
  state.activePanel = panel;
  dom.selectedPanel.hidden = !panel;
  dom.upper.classList.toggle('panel-open', Boolean(panel));
  dom.inspectorView.hidden = panel !== 'inspector';
  dom.shapeToolView.hidden = panel !== 'shape';
  dom.markerToolView.hidden = panel !== 'marker';
  dom.debugPanel.hidden = panel !== 'debug';
  dom.selectedPanelTitle.textContent = panel ? PANEL_TITLES[panel] : 'Inspector';
  for (const button of dom.globalActions.querySelectorAll('[data-panel-action]')) {
    const active = button.dataset.panelAction === panel;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-expanded', String(Boolean(panel)));
  }
  if (panel === 'debug') startDebug();
  else stopDebug();
  window.requestAnimationFrame(() => {
    if (preview) preview.layout();
    if (sourcePreview) sourcePreview.layout();
  });
}

function toggleSelectedPanel(panel) {
  activateSelectedPanel(P.toggledPanel(state.activePanel, panel));
}

async function prepareProxies() {
  if (!state.path || !window.api.available) return;
  try {
    adoptProxyStatuses(await window.api.startProxies(state.path));
  } catch (error) {
    reportError(error, 'proxy:start');
  }
}

function adoptWaveformStatuses(statuses) {
  state.waveforms = Object.fromEntries((statuses || []).map((status) => [status.assetId, status]));
  renderLanes();
}

async function prepareWaveforms() {
  if (!state.path || !window.api.available) return;
  try {
    adoptWaveformStatuses(await window.api.startWaveforms(state.path));
  } catch (error) {
    reportError(error, 'waveform:start');
  }
}

function prepareDerivedMedia() {
  prepareProxies();
  prepareWaveforms();
}

function onProxyStatus(statuses) {
  const becameReady = (statuses || []).some((status) => {
    const before = state.proxies[status.assetId];
    return status.state === 'ready' && (!before || before.state !== 'ready');
  });
  adoptProxyStatuses(statuses);
  if (becameReady && preview) {
    void Promise.resolve(preview.refreshMedia()).catch((error) => reportError(error, 'proxy:refresh'));
  }
}

function onWaveformStatus(statuses) {
  if (!(statuses || []).length) {
    state.waveforms = {};
  } else {
    for (const status of statuses) state.waveforms[status.assetId] = status;
  }
  renderLanes();
}

function renderAssets() {
  dom.assetList.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const asset of state.project.assets) {
    const item = document.createElement('li');
    item.className = 'asset';
    item.dataset.id = asset.id;
    item.title = asset.path;
    if (asset.id === state.selectedAssetId) item.classList.add('selected');

    const name = document.createElement('span');
    name.className = 'asset-name';
    name.textContent = asset.name || baseName(asset.path);
    const meta = document.createElement('span');
    meta.className = 'asset-meta';
    meta.textContent = assetSummary(asset);
    const remove = document.createElement('button');
    remove.className = 'asset-remove';
    remove.dataset.remove = asset.id;
    remove.title = 'Remove this asset and its clips';
    remove.textContent = '×';

    item.append(name, meta, remove);
    fragment.appendChild(item);
  }
  dom.assetList.appendChild(fragment);
  dom.assetEmpty.hidden = state.project.assets.length > 0;
}

function selectedSourceAsset() {
  return state.selectedAssetId ? L.findAsset(state.project, state.selectedAssetId) : null;
}

function sourceTime(frame) {
  return L.formatTimecode(Math.max(0, Math.round(frame || 0)), rate());
}

function renderSourceMonitor() {
  const asset = selectedSourceAsset();
  if (state.selectedAssetId && !asset) {
    state.selectedAssetId = null;
    state.sourceSelection = null;
    if (sourcePreview) sourcePreview.showAsset(null);
  }
  const selection = asset && (state.sourceSelection || S.selectionFor(asset, rate()));
  const limit = asset ? S.sourceLimitFrames(asset, rate()) : 0;
  if (selection) state.sourceSelection = selection;
  dom.sourceHint.hidden = Boolean(asset);
  dom.sourceClock.textContent = sourceTime(sourcePreview ? sourcePreview.position() : 0);
  dom.sourceDuration.textContent = sourceTime(limit);
  dom.sourceSeek.max = String(Math.max(1, limit));
  dom.sourceSeek.value = String(Math.min(limit, Math.round(sourcePreview ? sourcePreview.position() : 0)));
  dom.sourceSeek.disabled = !asset || asset.kind === 'image';
  dom.sourceMarkerLayer.hidden = !selection || !asset || asset.kind === 'image';
  if (selection) {
    dom.sourceInMarker.style.left = `${S.markerPercent(selection.inPoint, limit)}%`;
    dom.sourceOutMarker.style.left = `${S.markerPercent(selection.outPoint, limit)}%`;
    const shade = S.rangeShade(selection, limit);
    dom.sourceBeforeRange.style.width = `${shade.beforePercent}%`;
    dom.sourceAfterRange.style.width = `${shade.afterPercent}%`;
  }
  dom.sourceRange.textContent = selection
    ? `${sourceTime(selection.inPoint)} – ${sourceTime(selection.outPoint)}`
    : `${sourceTime(0)} – ${sourceTime(0)}`;
  const canVideo = Boolean(asset) && (asset.kind === 'video' || asset.kind === 'image');
  const canAudio = Boolean(asset) &&
    (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio));
  dom.sourceVideo.disabled = !canVideo;
  dom.sourceAudio.disabled = !canAudio;
  if (!canVideo) dom.sourceVideo.checked = false;
  if (!canAudio) dom.sourceAudio.checked = false;
  dom.sourcePlay.disabled = !asset || asset.kind === 'image';
  dom.sourceMarkIn.disabled = !asset || asset.kind === 'image';
  dom.sourceMarkOut.disabled = !asset || asset.kind === 'image';
  const command = asset && S.commandFor('insert', state.project, asset, selection, {
    video: dom.sourceVideo.checked,
    audio: dom.sourceAudio.checked,
    targetTrackId: state.targetTrackId,
    start: preview ? preview.position() : 0,
  });
  for (const button of [dom.sourceInsert, dom.sourceOverwrite, dom.sourceAppend]) {
    button.disabled = !command;
  }
}

function setSourceMark(which) {
  const asset = selectedSourceAsset();
  if (!asset || !state.sourceSelection || !sourcePreview) return;
  const at = Math.round(sourcePreview.position());
  state.sourceSelection = which === 'in'
    ? S.markIn(state.sourceSelection, at)
    : S.markOut(state.sourceSelection, at, S.sourceLimitFrames(asset, rate()));
  renderSourceMonitor();
}

function sourceDragPayload() {
  const asset = selectedSourceAsset();
  if (!asset || !state.sourceSelection) return null;
  const video = dom.sourceVideo.checked && !dom.sourceVideo.disabled;
  const audio = dom.sourceAudio.checked && !dom.sourceAudio.disabled;
  if (!video && !audio) return null;
  return {
    asset,
    selection: { ...state.sourceSelection },
    video,
    audio,
    rippleAllTracks: dom.sourceRipple.value === 'all',
  };
}

async function insertSourceAt(source, trackId, start) {
  const command = S.commandFor('insert', state.project, source.asset, source.selection, {
    video: source.video,
    audio: source.audio,
    targetTrackId: trackId,
    start,
    rippleAllTracks: source.rippleAllTracks,
  });
  if (!command) return;
  const made = await edit(command);
  selectMadeOnTrack(made, trackId);
}

async function placeSource(mode) {
  const asset = selectedSourceAsset();
  if (!asset || !state.sourceSelection) return;
  const command = S.commandFor(mode, state.project, asset, state.sourceSelection, {
    video: dom.sourceVideo.checked,
    audio: dom.sourceAudio.checked,
    targetTrackId: state.targetTrackId,
    start: preview.position(),
    rippleAllTracks: dom.sourceRipple.value === 'all',
  });
  if (!command) return;
  const made = await edit(command);
  selectMadeOnTrack(made, command.videoTrackId || command.audioTrackId);
}

/** An asset whose length ffprobe could not report is measured by the browser
 *  instead, once. Without this every clip of it would be five seconds long.
 *
 *  Learning a file's real length is not an edit and is not undoable, so it goes
 *  in through its own command rather than as one more thing on the stack. */
function hydrateDuration(asset) {
  if (asset.durationMs > 0 || asset.kind === 'image') return;
  const probe = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
  probe.preload = 'metadata';
  probe.src = window.api.fileUrl(asset.path);
  probe.addEventListener('loadedmetadata', async () => {
    if (!Number.isFinite(probe.duration) || probe.duration <= 0) return;
    const live = L.findAsset(state.project, asset.id);
    if (!live || live.durationMs > 0) return;
    try {
      adopt(
        await window.api.describeAsset(
          asset.id,
          Math.round(probe.duration * 1000),
          probe.videoWidth || 0,
          probe.videoHeight || 0
        )
      );
    } catch (error) {
      // The asset went away between the load starting and finishing. There is
      // nothing to say about it and nothing to fix.
      return;
    }
    refresh();
  });
}

/** What a set of paths turns out to be. Nothing is imported yet: the caller
 *  decides what command that becomes, so dropping files on a track can put the
 *  import and the clips into one undo step. */
async function probePaths(paths) {
  if (!paths || !paths.length) return [];
  const found = await window.api.importAssets(paths);
  if (!found.length) {
    await window.api.message('None of those files are video, audio or images.', {
      title: 'Nothing imported',
    });
  }
  return found;
}

async function importViaDialog() {
  const picked = await window.api.pickMedia();
  if (!picked) return;
  const found = await probePaths(Array.isArray(picked) ? picked : [picked]);
  if (!found.length) return;
  await edit({ op: 'addAssets', assets: found });
  for (const asset of found) hydrateDuration(asset);
}

// --- timeline --------------------------------------------------------------

function renderHeads() {
  dom.heads.textContent = '';
  const spacer = document.createElement('div');
  spacer.className = 'ruler-spacer';
  dom.heads.appendChild(spacer);

  for (const track of displayTracks()) {
    const head = document.createElement('div');
    head.className = `head ${track.kind}`;
    head.dataset.trackId = track.id;

    const name = document.createElement('span');
    name.className = 'head-name';
    name.textContent = track.name;

    const buttons = document.createElement('span');
    buttons.className = 'head-buttons';
    const target = document.createElement('button');
    target.dataset.targetTrack = track.id;
    target.textContent = 'target';
    target.title = 'Use only this track for previous and next edit navigation';
    target.className = track.id === state.targetTrackId ? 'target on' : 'target';
    buttons.appendChild(target);
    if (track.kind === 'video' || track.kind === 'subtitle') {
      const hide = document.createElement('button');
      hide.dataset.toggle = 'hidden';
      hide.textContent = 'hide';
      hide.title = 'Hide this track from the preview and the render';
      hide.className = track.hidden ? 'on' : '';
      buttons.appendChild(hide);
    }
    const mute = document.createElement('button');
    mute.dataset.toggle = 'muted';
    mute.textContent = 'mute';
    mute.title = 'Silence this track';
    mute.className = track.muted ? 'on' : '';
    buttons.appendChild(mute);

    head.append(name, buttons);
    dom.heads.appendChild(head);
  }
}

function clipElement(track, clip) {
  const asset = L.findAsset(state.project, clip.assetId);
  const node = document.createElement('div');
  node.className = `clip ${track.kind}`;
  node.dataset.clipId = clip.id;
  node.style.left = `${L.framesToPx(clip.start, rate(), state.pxPerSecond)}px`;
  const width = Math.max(2, L.framesToPx(L.clipDuration(clip), rate(), state.pxPerSecond));
  node.style.width = `${width}px`;
  if (clip.id === state.selectedClipId) node.classList.add('selected');
  if (clip.linkGroup) {
    node.classList.add('linked');
    node.title = 'Linked audio and video clip';
  }
  if (clip.lutPath) {
    const unavailable = state.lutStatus[clip.lutPath] === 'unavailable';
    node.classList.add('lut');
    node.classList.toggle('lut-unavailable', unavailable);
    const lutTitle = unavailable
      ? `3D LUT unavailable: ${baseName(clip.lutPath)}`
      : `3D LUT: ${baseName(clip.lutPath)}`;
    node.title = node.title ? `${node.title}; ${lutTitle}` : lutTitle;
  }

  const label = document.createElement('span');
  label.className = 'clip-name';
  label.textContent = asset ? asset.name || baseName(asset.path) : 'missing file';
  if (!asset) node.classList.add('missing');
  const left = document.createElement('span');
  left.className = 'handle left';
  const right = document.createElement('span');
  right.className = 'handle right';
  if (track.kind === 'audio' && asset) {
    const waveform = state.waveforms[asset.id];
    if (waveform && waveform.state === 'ready' && waveform.peaks.length) {
      const canvas = document.createElement('canvas');
      canvas.className = 'clip-waveform';
      drawWaveform(canvas, clip, waveform, width);
      node.appendChild(canvas);
    }
  }
  node.append(left, label, right);
  return node;
}

/** A text, shape or subtitle layer as a timeline element. The same element
 *  shape as a clip — left edge, name, trim handles — so a layer moves and
 *  trims the way a clip does. */
function visualElement(track, item) {
  const node = document.createElement('div');
  // A project should always contain content, but keep an incomplete saved
  // visual item from taking down the whole timeline while it is repaired.
  const content = item.content || {};
  const kind = content.kind === 'shape' ? 'shape' : 'text';
  node.className = track.kind === 'subtitle' ? 'clip subtitle' : `clip visual ${kind}`;
  node.dataset.visualItemId = item.id;
  node.style.left = `${L.framesToPx(item.start, rate(), state.pxPerSecond)}px`;
  node.style.width = `${Math.max(2, L.framesToPx(item.duration, rate(), state.pxPerSecond))}px`;
  if (item.id === state.selectedVisualItemId) node.classList.add('selected');
  const label = document.createElement('span');
  label.className = 'clip-name';
  label.textContent = kind === 'shape'
    ? `Shape — ${content.shape || 'rectangle'}`
    : content.text || (track.kind === 'subtitle' ? 'Subtitle' : 'Text');
  const left = document.createElement('span');
  left.className = 'handle left';
  const right = document.createElement('span');
  right.className = 'handle right';
  node.append(left, label, right);
  return node;
}

function drawWaveform(canvas, clip, waveform, cssWidth) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.min(4096, Math.ceil(cssWidth * ratio)));
  const height = Math.ceil(32 * ratio);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const { first, last } = L.waveformBucketRange(clip, rate(), waveform.bucketsPerSecond);
  const span = Math.max(1, last - first);
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--waveform')
    .trim() || '#205f42';
  context.lineWidth = Math.max(1, ratio);
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const from = Math.min(
      waveform.peaks.length - 1,
      Math.max(0, Math.floor(first + (x / width) * span))
    );
    const to = Math.min(
      waveform.peaks.length,
      Math.max(from + 1, Math.ceil(first + ((x + 1) / width) * span))
    );
    let [min, max] = waveform.peaks[from];
    for (let index = from + 1; index < to; index += 1) {
      min = Math.min(min, waveform.peaks[index][0]);
      max = Math.max(max, waveform.peaks[index][1]);
    }
    context.moveTo(x + 0.5, ((1 - max) * height) / 2);
    context.lineTo(x + 0.5, ((1 - min) * height) / 2);
  }
  context.stroke();
}

function renderLanes() {
  dom.lanes.textContent = '';
  const width = L.framesToPx(contentFrames(), rate(), state.pxPerSecond);
  dom.content.style.width = `${width}px`;

  for (const track of displayTracks()) {
    const lane = document.createElement('div');
    lane.className = `lane ${track.kind}`;
    lane.dataset.trackId = track.id;
    if (track.hidden) lane.classList.add('off');
    if (track.muted) lane.classList.add('muted');
    if (track.kind === 'subtitle') {
      for (const item of track.visualItems || []) lane.appendChild(visualElement(track, item));
    } else {
      for (const clip of track.clips) lane.appendChild(clipElement(track, clip));
      // Text and shape layers ride on video tracks beside the clips. Without
      // an element here they exist only on the stage, which is how a layer
      // ends up impossible to move, trim or delete.
      for (const item of track.visualItems || []) lane.appendChild(visualElement(track, item));
    }
    dom.lanes.appendChild(lane);
  }
}

function renderRuler() {
  dom.ruler.textContent = '';
  const total = contentFrames();
  const step = L.tickStepFrames(state.pxPerSecond, rate());
  const fragment = document.createDocumentFragment();
  for (let frame = 0; frame <= total; frame += step) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = `${L.framesToPx(frame, rate(), state.pxPerSecond)}px`;
    tick.textContent = L.formatRulerLabel(frame, rate());
    fragment.appendChild(tick);
  }
  dom.ruler.appendChild(fragment);
  for (const marker of state.project.markers || []) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'marker';
    node.dataset.markerId = marker.id;
    node.style.left = `${L.framesToPx(marker.frame, rate(), state.pxPerSecond)}px`;
    node.style.color = marker.color;
    node.title = marker.name || L.formatTimecode(marker.frame, rate());
    dom.ruler.appendChild(node);
  }
}

function renderMarkerList() {
  dom.markerList.textContent = '';
  const markers = P.orderedMarkers(state.project.markers);
  dom.markerEmpty.hidden = markers.length > 0;
  for (const marker of markers) {
    const row = document.createElement('div');
    row.className = 'marker-row';
    const seek = document.createElement('button');
    seek.type = 'button';
    seek.dataset.markerSeek = marker.id;
    seek.textContent = L.formatTimecode(marker.frame, rate());
    const color = document.createElement('input');
    color.type = 'color';
    color.value = marker.color;
    color.dataset.markerColor = marker.id;
    const name = document.createElement('input');
    name.type = 'text';
    name.value = marker.name;
    name.placeholder = 'Marker name';
    name.dataset.markerName = marker.id;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.markerRemove = marker.id;
    remove.textContent = 'Delete';
    row.append(seek, color, name, remove);
    dom.markerList.appendChild(row);
  }
}

/** The two menu items that are only sometimes there to press, and what they
 *  say they will take back. */
function updateHistoryUi() {
  const doc = state.doc || { canUndo: false, canRedo: false, undoLabel: '', redoLabel: '' };
  const undo = el('menu-undo');
  const redo = el('menu-redo');
  if (!undo || !redo) return;
  undo.disabled = !doc.canUndo;
  redo.disabled = !doc.canRedo;
  undo.firstChild.textContent = doc.canUndo ? `Undo ${doc.undoLabel}` : 'Undo';
  redo.firstChild.textContent = doc.canRedo ? `Redo ${doc.redoLabel}` : 'Redo';
}

function updateMonitorZoomUi() {
  const zoom = preview && preview.zoomState ? preview.zoomState() : { zoom: 1, available: false };
  el('menu-monitor-zoom-in').disabled = !zoom.available || zoom.zoom >= 4;
  el('menu-monitor-zoom-out').disabled = !zoom.available || zoom.zoom <= 1;
  el('menu-monitor-fit').disabled = !zoom.available || zoom.zoom === 1;
}

function renderTimeline() {
  if (state.selectedVisualItemId && !stageController.selectedVisualItem()) stageController.selectVisualItem(null);
  renderHeads();
  renderRuler();
  renderLanes();
  renderMarkerList();
  inspectorController.render();
  updatePlayhead(preview ? preview.position() : 0);
  dom.duration.textContent = L.formatTimecode(L.projectDurationFrames(state.project), rate());
  dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
  dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddSubtitle.disabled = L.tracksOf(state.project, 'subtitle').length >= 1;
  updateLinkUi();
  updateHistoryUi();
  updateMonitorZoomUi();
  stageController.renderStageOverlay();
  stageController.scheduleExactFrame();
  if (preview) preview.redraw();
}

function checkLutFiles() {
  const paths = new Set();
  for (const track of state.project.tracks) {
    for (const clip of track.clips) {
      const path = clip.lutPath;
      if (path) paths.add(path);
    }
  }
  for (const path of Object.keys(state.lutStatus)) {
    if (!paths.has(path)) delete state.lutStatus[path];
  }
  for (const path of paths) {
    if (state.lutStatus[path]) continue;
      state.lutStatus[path] = 'checking';
      window.api.validateLut(path)
        .then(() => { state.lutStatus[path] = 'ready'; renderTimeline(); })
        .catch(() => { state.lutStatus[path] = 'unavailable'; renderTimeline(); });
  }
}

function refresh() {
  renderAssets();
  renderSourceMonitor();
  renderTimeline();
  checkLutFiles();
  el('menu-delete-project').disabled = !state.path;
  if (preview) {
    preview.prune();
    preview.layout();
  }
  if (sourcePreview) sourcePreview.layout();
  updateTitle();
}

function updatePlayhead(frame) {
  dom.playhead.style.left = `${L.framesToPx(frame, rate(), state.pxPerSecond)}px`;
  dom.clock.textContent = L.formatTimecode(frame, rate());
  dom.stageHint.hidden = L.projectDurationFrames(state.project) > 0 || preview.mode() === 'asset';
  stageController.syncEditorOverlay();
  stageController.renderStageOverlay();
  stageController.drawStageVisuals();
}

function seekPreviousEdit() {
  const point = L.previousEditPoint(state.project, preview.position(), state.targetTrackId);
  if (point !== null) preview.seek(point);
}

function seekNextEdit() {
  const point = L.nextEditPoint(state.project, preview.position(), state.targetTrackId);
  if (point !== null) preview.seek(point);
}

function seekTimelineStart() {
  preview.seek(0);
}

function seekTimelineEnd() {
  preview.seek(L.projectDurationFrames(state.project));
}

function seekTimelineOffset(offset) {
  preview.seek(Math.round(preview.position()) + offset);
}

/** Keep the playhead on screen while it runs, without fighting a user who is
 *  scrolling somewhere else. */
function followPlayhead(frame) {
  if (!preview.isPlaying()) return;
  const x = L.framesToPx(frame, rate(), state.pxPerSecond);
  const left = dom.scroll.scrollLeft;
  const right = left + dom.scroll.clientWidth;
  if (x < left || x > right - 40) dom.scroll.scrollLeft = Math.max(0, x - dom.scroll.clientWidth * 0.3);
}

function closeTimelineContextMenu() {
  if (!dom.timelineContextMenu) return;
  dom.timelineContextMenu.hidden = true;
  dom.timelineContextMenu.textContent = '';
}

/** The desktop application's menu is part of the page, like the menu bar.
 *  This keeps the target and the action in one event flow and never exposes
 *  the webview's Reload menu over unsaved edits. */
function openTimelineContextMenu(event, items) {
  const menu = dom.timelineContextMenu;
  if (!menu || !items.length) return;
  menu.textContent = '';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      closeTimelineContextMenu();
      Promise.resolve().then(() => item.run()).catch((error) => reportError(error, `timeline-menu:${item.label}`));
    });
    menu.appendChild(button);
  }
  menu.hidden = false;
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(event.clientX, window.innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(event.clientY, window.innerHeight - box.height - 4))}px`;
}

function updateLinkUi() {
  const selected = liveSelection();
  const found = selected && L.findClip(state.project, selected);
  dom.btnLink.disabled = !found || (!found.clip.linkGroup && !L.relinkCandidate(state.project, selected));
  dom.btnLink.textContent = found && found.clip.linkGroup ? 'Unlink Clips' : 'Link Clips';
}

function selectAsset(assetId) {
  state.selectedAssetId = assetId;
  const asset = L.findAsset(state.project, assetId);
  state.sourceSelection = asset ? S.selectionFor(asset, rate()) : null;
  dom.sourceVideo.checked = Boolean(asset) && (asset.kind === 'video' || asset.kind === 'image');
  dom.sourceAudio.checked = Boolean(asset) &&
    (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio));
  if (sourcePreview) sourcePreview.showAsset(asset);
  renderAssets();
  renderSourceMonitor();
  inspectorController.render();
}

/** The selection is an id, and clips go away underneath it: opening a project,
 *  or removing an asset, takes its clips with it. A stale id would make Split
 *  quietly cut nothing at all, so every reader of the selection goes through
 *  here and a dead one is dropped on the spot. */
function liveSelection() {
  if (!state.selectedClipId) return null;
  if (L.findClip(state.project, state.selectedClipId)) return state.selectedClipId;
  state.selectedClipId = null;
  return null;
}

function splitAtPlayhead() {
  return edit({
    op: 'splitAt',
    frame: Math.round(preview.position()),
    clipId: liveSelection(),
  });
}

function addMarker(frame = Math.round(preview.position())) {
  return edit({ op: 'addMarker', frame, name: '', color: '#e6a700' });
}

/** A drag names its destination. A click does not: Rust then reuses a
 *  clip-free top overlay track, creates one, or falls back at the track cap. */
function visualTargetTrack(placement) {
  if (!placement) return null;
  const track = L.findTrack(state.project, placement.trackId);
  return track && track.kind === 'video' ? track : null;
}

/** Add a visual item and select what Rust made of it. `placement` is
 *  `{ trackId, frame }` from a drop; without one Rust chooses the top overlay
 *  track at the playhead. */
async function addVisualItem(placement, content, transform) {
  const track = visualTargetTrack(placement);
  if (placement && !track) return;
  const known = new Set();
  for (const candidate of state.project.tracks) {
    for (const item of candidate.visualItems || []) known.add(item.id);
  }
  const videos = L.tracksOf(state.project, 'video');
  const top = videos[videos.length - 1];
  const reusable = top && !top.clips.length && (top.visualItems || []).every((item) =>
    item.content && (item.content.kind === 'text' || item.content.kind === 'shape'));
  const atLimit = !placement && videos.length >= L.MAX_TRACKS_PER_KIND && !reusable;
  const command = {
    op: placement ? 'addVisualItem' : 'addOverlayVisualItem',
    ...(placement ? { trackId: track.id } : {}),
    content,
    start: placement ? Math.round(placement.frame) : Math.round(preview.position()),
    duration: L.defaultVisualItemFrames(rate()),
    transform: { ...transform, rotation: 0, opacity: 1 },
    zIndex: 0,
  };
  const done = await edit(command);
  if (done === null) return;
  let item = null;
  for (const candidate of state.project.tracks) {
    item = (candidate.visualItems || []).find((entry) => !known.has(entry.id));
    if (item) break;
  }
  if (item) stageController.selectVisualItem(item.id);
  if (atLimit) {
    await window.api.message(
      `The ${L.MAX_TRACKS_PER_KIND}-video-track limit was reached. The layer was added to the top video track.`,
      { title: 'Layer added to existing track', kind: 'warning' },
    );
  }
}

function addText(placement) {
  return addVisualItem(placement, {
    kind: 'text',
    text: 'Title',
    style: {
      fontFamily: 'sans-serif', fontSize: 64, align: 'center',
      fills: [{ kind: 'solid', color: '#ffffff' }],
      stroke: null,
      shadow: { color: '#00000080', x: 2, y: 2, blur: 0 },
    },
  }, {
    x: state.project.settings.width * 0.1,
    y: state.project.settings.height * 0.12,
    width: state.project.settings.width * 0.8,
    height: state.project.settings.height * 0.2,
  });
}

function shapeTransform(shape) {
  const square = shape === 'ellipse' || shape === 'polygon' || shape === 'star';
  const line = shape === 'line';
  const width = state.project.settings.width * 0.4;
  const height = state.project.settings.height * (line ? 0.08 : square ? 0.35 : 0.25);
  return {
    x: (state.project.settings.width - width) / 2,
    y: (state.project.settings.height - height) / 2,
    width,
    height,
  };
}

function addShape(shape, placement) {
  return addVisualItem(placement, {
    kind: 'shape', shape,
    fills: [{ kind: 'solid', color: '#4f8cffcc' }],
    stroke: { color: '#ffffff', width: 4 }, shadow: null,
    cornerRadius: shape === 'roundedRectangle' ? 20 : 0,
    startArrow: false,
    endArrow: false,
  }, shapeTransform(shape));
}

async function addSubtitle() {
  const track = L.tracksOf(state.project, 'subtitle')[0];
  if (!track) return;
  const start = Math.round(preview.position());
  const duration = Math.max(1, Math.round(T.rateToNumber(rate()) * 2));
  const known = new Set((track.visualItems || []).map((item) => item.id));
  await edit({
    op: 'addVisualItem',
    trackId: track.id,
    content: { kind: 'text', text: 'Subtitle', style: {} },
    start,
    duration,
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1 },
    zIndex: 0,
  });
  const item = (L.findTrack(state.project, track.id).visualItems || []).find((entry) => !known.has(entry.id));
  if (item) stageController.selectVisualItem(item.id);
}

async function importSrt() {
  const track = L.tracksOf(state.project, 'subtitle')[0];
  if (!track) return;
  const path = await window.api.pickSrtOpen();
  if (!path) return;
  adopt(await window.api.importSrt(track.id, path));
  refresh();
}

async function exportSrt() {
  const track = L.tracksOf(state.project, 'subtitle')[0];
  if (!track) return;
  const path = await window.api.pickSrtSave('subtitles.srt');
  if (!path) return;
  await window.api.exportSrt(track.id, path);
}

async function deleteSelected(ripple) {
  // Selections are exclusive, so a selected layer is the thing the user is
  // looking at; a gap cannot ripple behind one, so both buttons remove it.
  if (stageController.selectedVisualItem()) return inspectorController.removeSelectedVisualItem();
  const clipId = liveSelection();
  if (!clipId) return;
  // edit() answers null when the edit was refused. The empty array a delete
  // gets back is a success that made no clips, and it is not null.
  const done = await edit({ op: ripple ? 'rippleDelete' : 'removeClip', clipId });
  if (done) state.selectedClipId = null;
}

async function toggleClipLink() {
  const clipId = liveSelection();
  if (!clipId) return;
  const found = L.findClip(state.project, clipId);
  if (!found) return;
  if (found.clip.linkGroup) {
    await edit({ op: 'unlinkClips', clipId });
    return;
  }
  const candidate = L.relinkCandidate(state.project, clipId);
  if (!candidate) return;
  await edit({ op: 'linkClips', clipIds: [clipId, candidate.clip.id] });
}

async function setClipLut(clipId) {
  const path = await window.api.pickLut();
  if (!path) return;
  await window.api.validateLut(path);
  await edit({ op: 'setClipLut', clipId, lutPath: path });
}

/** Persist a setting changed from a toolbar or the transport, where there is no
 *  sheet to report into.
 *
 *  These are one-click toggles, so blocking on the write would make the button
 *  feel slow for something that has already visibly happened. What must not
 *  happen is an unhandled rejection: the whole toolbar is put back to the last
 *  backend-confirmed boot settings and the reason is shown. An earlier
 *  optimistic value may itself have been superseded, so it is not a rollback
 *  point. `bootstrap` is the source of truth on the next launch either way.
 */
function persistSettings(settings = state.settings, callbacks) {
  return persistLatestSettings({ ...settings }, callbacks);
}

function persistSettingsInBackground() {
  void persistSettings().catch((error) => {
    reportError(error, 'settings:persist:callback');
  });
}

function toggleSnap() {
  state.settings.snap = !state.settings.snap;
  dom.btnMagnet.classList.toggle('on', state.settings.snap);
  persistSettingsInBackground();
}

// --- render ----------------------------------------------------------------

async function startRender(preset) {
  if (state.rendering) return;
  if (!state.boot || !state.boot.ffmpeg) {
    await window.api.message(
      'Rendering needs ffmpeg. Install it with `brew install ffmpeg`, then reopen the app, ' +
        'or point Settings → Preview & Tools at the folder that holds it.',
      { title: 'ffmpeg not found', kind: 'error' }
    );
    return;
  }
  if (L.projectDurationFrames(state.project) <= 0) {
    await window.api.message('The timeline is empty.', { title: 'Nothing to render' });
    return;
  }
  // Renders land next to the project by default, so a project folder ends up
  // holding the edit and what came out of it.
  const dir = projectDir();
  const file = `${projectName().toLowerCase().replace(/\s+/g, '-')}-${preset}.mp4`;
  const output = await window.api.pickRenderOutput(dir ? `${dir}/${file}` : file);
  if (!output) return;

  state.rendering = true;
  preview.pause();
  const hardware =
    state.settings.renderAcceleration !== 'cpu' &&
    state.boot.acceleration &&
    state.boot.acceleration.available;
  dom.renderTitle.textContent = hardware
    ? `Rendering ${preset.toUpperCase()} on ${hardware.label}`
    : `Rendering ${preset.toUpperCase()} on the CPU`;
  dom.renderStatus.textContent = 'Starting ffmpeg…';
  dom.renderBar.style.width = '0%';
  dom.renderCancel.hidden = false;
  dom.renderClose.hidden = true;
  dom.renderOverlay.hidden = false;
  try {
    // No project goes with the request. Rust takes its own copy of the
    // document and remembers which revision it took, so an edit made while
    // this runs cannot half reach the file being written.
    await window.api.startRender(output, preset);
  } catch (error) {
    reportError(error, 'render:start');
    state.rendering = false;
    dom.renderOverlay.hidden = true;
    await window.api.message(String(error), { title: 'Render failed', kind: 'error' });
  }
}

function onRenderProgress(payload) {
  if (!state.rendering) return;
  // ffmpeg reports where it has got to in milliseconds, which is all a
  // progress bar needs; it becomes frames only to be read out as a timecode.
  const percent = payload.totalMs > 0 ? Math.min(100, (payload.positionMs / payload.totalMs) * 100) : 0;
  const clock = (ms) => L.formatTimecode(T.framesFromMillis(ms, rate()), rate());
  dom.renderBar.style.width = `${percent}%`;
  dom.renderStatus.textContent = `${clock(payload.positionMs)} of ${clock(payload.totalMs)} — ${Math.round(percent)}%`;
}

/** The hardware encoder failed on this particular file, so the CPU is redoing
 *  it from the start. Saying so beats a progress bar that jumps back to zero
 *  for no visible reason. */
function onRenderFallback(payload) {
  if (!state.rendering) return;
  dom.renderTitle.textContent = 'Rendering on the CPU';
  dom.renderStatus.textContent = `${payload.from} could not encode this one. Starting again with libx264…`;
  dom.renderBar.style.width = '0%';
}

function onRenderDone(payload) {
  state.rendering = false;
  dom.renderCancel.hidden = true;
  dom.renderClose.hidden = false;
  if (payload.ok) {
    dom.renderBar.style.width = '100%';
    dom.renderTitle.textContent = 'Render finished';
    const how = payload.fellBack
      ? ' (the CPU finished it after the hardware encoder failed)'
      : payload.accelerator
        ? ` (${payload.accelerator})`
        : '';
    // Editing during a render is allowed, so the file can be of a timeline
    // that no longer exists. Saying so beats letting somebody compare the
    // output against what is on screen and conclude the render is broken.
    const stale = payload.edited
      ? '\nThe timeline was edited while this was running, so the file is the timeline as it was when the render started.'
      : '';
    dom.renderStatus.textContent = `${payload.path}${how}${stale}`;
  } else {
    dom.renderTitle.textContent = payload.cancelled ? 'Render cancelled' : 'Render failed';
    dom.renderStatus.textContent = payload.message || '';
    if (!payload.cancelled) reportError(payload.message || 'Render failed', 'render');
  }
}

// --- project files ---------------------------------------------------------

async function confirmDiscard(what) {
  if (!isDirty()) return true;
  return window.api.ask(`This project has unsaved changes. ${what} anyway?`, {
    title: 'Unsaved changes',
    kind: 'warning',
  });
}

/** Take on a document Rust has just opened or made, and reset everything the
 *  page keeps alongside it. The history belongs to the document, so opening a
 *  project starts with nothing to undo. */
function loadDocument(doc, path) {
  if (preview) preview.setEditing(false);
  editorOverlayActive = false;
  dom.stage.classList.remove('editing');
  visualDrag = null;
  adopt(doc);
  state.path = path || null;
  state.savedRevision = doc.revision;
  state.selectedClipId = null;
  state.selectedVisualItemId = null;
  state.selectedAssetId = null;
  state.sourceSelection = null;
  state.targetTrackId = null;
  state.proxies = {};
  state.waveforms = {};
  preview.clear();
  preview.showTimeline();
  if (sourcePreview) {
    sourcePreview.clear();
    sourcePreview.showAsset(null);
  }
  for (const asset of state.project.assets) hydrateDuration(asset);
  refresh();
  prepareDerivedMedia();
  // A monitor is built for the project it draws — the output size and the
  // clips are read when the frame source is made — so opening a different one
  // means a new session rather than a reused one.
  attachMonitor(true);
}

/** A project is a folder under the workspace, so New asks for a name rather
 *  than for a place to put a file. The folder is made now and the project file
 *  written straight away, so the project has a home before the first import. */
async function newProject() {
  if (!(await confirmDiscard('Start a new project'))) return;
  el('np-name').value = '';
  el('np-error').hidden = true;
  el('np-where').textContent = `A folder will be made in ${state.boot.workspace}`;
  openSheet('new-project');
  el('np-name').focus();
}

async function createProjectFromSheet() {
  const error = el('np-error');
  try {
    const entry = await window.api.createProject(el('np-name').value);
    closeSheet('new-project');
    loadDocument(await window.api.newDocument(), entry.path);
    // Written immediately: an empty folder with no project file in it would not
    // show up in Open, and would look like the project was never made.
    await window.api.saveProject(entry.path);
    updateTitle();
  } catch (failure) {
    reportError(failure, 'project:create');
    error.textContent = String(failure);
    error.hidden = false;
  }
}

async function openProject() {
  if (!(await confirmDiscard('Open another project'))) return;
  const projects = await window.api.listProjects();
  const list = el('op-list');
  list.textContent = '';
  for (const entry of projects) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'project-row';
    button.dataset.path = entry.path;
    const name = document.createElement('span');
    name.textContent = entry.name;
    const when = document.createElement('span');
    when.className = 'project-when';
    when.textContent = entry.modifiedMs ? new Date(entry.modifiedMs).toLocaleString() : '';
    button.append(name, when);
    item.appendChild(button);
    list.appendChild(item);
  }
  el('op-empty').hidden = projects.length > 0;
  el('op-where').textContent = state.boot.workspace;
  openSheet('open-project');
}

async function openProjectPath(path) {
  closeSheet('open-project');
  try {
    const doc = await window.api.openProject(path);
    // Anything that is not a document is a failure, whether or not it arrived
    // as one: the browser fallback answers null rather than throwing, and
    // handing that to loadDocument would take the page down with a type error
    // instead of showing why the project would not open.
    if (!doc || !doc.project) throw new Error(`${path} could not be opened.`);
    loadDocument(doc, path);
    return true;
  } catch (error) {
    reportError(error, 'project:open');
    await window.api.message(String(error), { title: 'Cannot open', kind: 'error' });
    return false;
  }
}

function qualitySmokeConfig() {
  return {
    continuousMs: 5000,
    restartCount: 2,
    restartPlayMs: 1000,
    restartPauseMs: 100,
    trackStepMs: 1000,
    seekCount: 3,
    seekIntervalMs: 300,
  };
}

async function saveProject(forcePicker) {
  let path = state.path;
  if (!path || forcePicker) {
    const dir = projectDir();
    const suggested = `${projectName() === 'Untitled' ? 'untitled' : projectName()}.akbunvideo`;
    path = await window.api.pickProjectSave(dir ? `${dir}/${suggested}` : suggested);
    if (!path) return false;
  }
  try {
    await window.api.saveProject(path);
    state.path = path;
    prepareDerivedMedia();
    // What is on disk is this revision, which is what makes the dot go away —
    // and come back the moment anything else is done.
    state.savedRevision = state.doc.revision;
    updateTitle();
    return true;
  } catch (error) {
    reportError(error, 'project:save');
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
    return false;
  }
}

async function closeProject() {
  if (!(await confirmDiscard('Close this project'))) return;
  loadDocument(await window.api.newDocument(), null);
}

async function deleteProject() {
  if (!state.path) return;
  const name = projectName();
  const deleteFolder = state.settings.deleteProjectFolder;
  const message = deleteFolder
    ? `Move “${name}” project folder to Trash?\n\nThe project folder, project work file, generated proxies, and renders will be deleted. Imported source media will not be deleted.`
    : `Move “${name}” project work file to Trash?\n\nOnly the project work file will be deleted. The project folder, generated proxies, renders, and imported source media will remain.`;
  const confirmed = await window.api.ask(
    message,
    { title: 'Delete Project', kind: 'warning' },
  );
  if (!confirmed) return;

  preview.clear();
  await preview.release();
  try {
    await window.api.deleteProject(state.path);
    loadDocument(await window.api.newDocument(), null);
  } catch (error) {
    reportError(error, 'project:delete');
    preview.showTimeline();
    refresh();
    attachMonitor(true);
    await window.api.message(String(error), { title: 'Cannot delete project', kind: 'error' });
  }
}

// --- settings sheets -------------------------------------------------------

function openSheet(id) {
  el(id).hidden = false;
  // The monitor is a native view over the webview and is not in the page's
  // stacking order, so a sheet drawn over the stage would be behind it.
  if (preview) preview.setVisible(false);
}

function closeSheet(id) {
  el(id).hidden = true;
  if (preview && !anySheetOpen()) preview.setVisible(true);
}

/** Whether anything is still drawn over the stage. Sheets can be stacked —
 *  Settings opens over the project sheet — so closing one is not the same as
 *  the stage being clear. */
function anySheetOpen() {
  return Boolean(document.querySelector('.sheet:not([hidden])'));
}

function fillProjectSheet() {
  const { width, height } = state.project.settings;
  el('ps-width').value = width;
  el('ps-height').value = height;
  el('ps-rate').value = T.rateRatio(rate());
  const key = `${width}x${height}`;
  const preset = el('ps-preset');
  preset.value = [...preset.options].some((option) => option.value === key) ? key : 'custom';
}

/** What the machine was found to have, in a sentence. "No hardware encoder"
 *  on its own is the kind of answer nobody can act on, so the reason each
 *  candidate was rejected comes with it. */
function accelerationNote() {
  const probe = (state.boot && state.boot.acceleration) || { available: null, tried: [] };
  if (probe.available) {
    const decode = probe.available.hwaccel ? `, decoding with ${probe.available.hwaccel}` : '';
    return `Encoding on ${probe.available.label} (${probe.available.encoder})${decode}.`;
  }
  if (!state.boot || !state.boot.ffmpeg) {
    return 'ffmpeg was not found, so nothing could be tested.';
  }
  if (!probe.tried.length) {
    return 'This ffmpeg build has no hardware encoder this app can use. Rendering on the CPU.';
  }
  const reasons = probe.tried
    .filter((item) => !item.works)
    .map((item) => `${item.label} — ${item.note}`)
    .join(' · ');
  return `No usable hardware encoder. ${reasons}`;
}

/** Whether the setting says to composite the project frame on the CPU.
 *
 *  Mirrors `stays_on_cpu` in Rust, and for the same reason: this one answer
 *  decides the exact frame and the render, and asking the question in several
 *  places is how those answers drift apart. The native monitor stays attached
 *  for both choices; CPU composition still uploads its finished picture to the
 *  display. Only "cpu" is cpu — older "auto" and "ffmpeg" values mean GPU. */
function staysOnCpu() {
  return state.settings.compositor === 'cpu';
}

/** What the one setting decides, all three of them, in the order they matter.
 *
 *  Takes the setting rather than reading it, because the sheet has to describe
 *  the choice being made and everywhere else has to describe the one in force. */
function compositorNote(setting) {
  const found = (state.boot && state.boot.compositor) || {};
  if (setting === 'cpu') {
    if (state.playbackNotice) {
      return `The CPU combines the layers, but the native monitor could not start: ${state.playbackNotice}. The older preview is playing instead.`;
    }
    return 'The CPU combines the layers while the native monitor keeps playing. A graphics device only displays the finished picture; ffmpeg still decodes, renders and encodes.';
  }
  const both =
    'The stage and the render come out of the same shader, so what is on screen is what lands in the file. Playback draws straight onto a surface in the window with the audio clock deciding when.';
  const drawing = found.device || 'the software compositor';
  // Both of these are the GPU setting not getting what it asked for, so neither
  // may claim the surface and the shared shader that only the working path has.
  if (state.playbackNotice) {
    return `Drawing with ${drawing}, but the monitor would not start: ${state.playbackNotice}. The older preview is playing instead.`;
  }
  if (found.fellBack) {
    return `No graphics device was found, so ${drawing} draws the exact frame and the older preview plays. The render still comes out of ffmpeg.`;
  }
  return `Drawing with ${drawing}. ${both}`;
}

/** Fill the graphics device list from what the machine actually has.
 *
 *  Asked for when the sheet opens rather than at boot: enumerating adapters
 *  opens the graphics stack, and the answer is only ever looked at here. The
 *  saved name is kept as an option even when it is missing, so a settings file
 *  carried from another machine shows what it asked for instead of silently
 *  reading as Auto. */
async function fillGraphicsDevices() {
  const select = el('as-gpu-device');
  const note = el('as-gpu-device-note');
  const chosen = state.settings.gpuDevice || '';
  let devices = [];
  try {
    devices = (await window.api.graphicsDevices()) || [];
  } catch (error) {
    devices = [];
  }
  const names = devices.map((device) => device.name);
  select.textContent = '';
  select.appendChild(new Option('Auto — whichever the system picks', ''));
  for (const device of devices) {
    select.appendChild(new Option(`${device.name} — ${device.kind}, ${device.backend}`, device.name));
  }
  if (chosen && !names.includes(chosen)) {
    select.appendChild(new Option(`${chosen} — not on this machine`, chosen));
  }
  select.value = chosen;
  // The sheet's own pending choice, not the saved one. CPU composition uses an
  // automatic presentation device, so there is no compositor device to pick.
  const onCpu = el('as-compositor').value === 'cpu';
  select.disabled = onCpu;
  const drawing = (state.boot && state.boot.compositor && state.boot.compositor.device) || 'nothing yet';
  if (!devices.length) {
    note.textContent = 'No graphics device was found, so there is nothing to choose between.';
    return;
  }
  note.textContent = onCpu
    ? 'The CPU combines the frame; an automatic graphics device only displays the result.'
    : `Drawing on ${drawing}. A change switches after the replacement picture is ready.`;
}

function fillAppSheet() {
  el('as-quality').value = state.settings.previewQuality;
  el('as-scrub-mute').checked = state.settings.previewMuteWhileScrubbing;
  el('as-snap').checked = state.settings.snap;
  el('as-action-safe-area').checked = state.settings.showActionSafeArea;
  el('as-title-safe-area').checked = state.settings.showTitleSafeArea;
  el('as-rule-of-thirds').checked = state.settings.showRuleOfThirds;
  el('as-center-lines').checked = state.settings.showCenterLines;
  el('as-theme').value = state.settings.theme;
  el('as-workspace').value = state.settings.workspaceDir;
  el('as-delete-project-folder').checked = state.settings.deleteProjectFolder;
  el('as-workspace-note').textContent = `Projects are folders in ${state.boot.workspace}. Imported media stays where it is — nothing is copied in here.`;
  // Rust's normalised answer rather than the stored string. A settings file
  // written when this was three choices holds "auto" or "ffmpeg", and putting
  // either into a two option select would show no selection at all.
  el('as-compositor').value = state.boot.compositor.setting;
  el('as-compositor-note').textContent = compositorNote(el('as-compositor').value);
  fillGraphicsDevices();
  el('as-accel').value = state.settings.renderAcceleration;
  el('as-accel-note').textContent = accelerationNote();
  el('as-ffmpeg').value = state.settings.ffmpegDir;
  el('as-tools').textContent = state.boot.ffmpeg
    ? `Found ffmpeg at ${state.boot.ffmpeg}`
    : 'ffmpeg was not found. Rendering is unavailable until it is.';
  el('as-log-dir').value = state.settings.logDir;
  el('as-log-size').value = state.settings.logRotationSize;
  el('as-log-unit').value = state.settings.logRotationUnit;
  const logDir = state.boot.logDir || 'the operating system application log folder';
  el('as-log-note').textContent = `Only errors are written to ${logDir}/errors.log. The previous file is kept as errors.log.1.`;
}

function fillProxySheet() {
  el('proxy-enabled').checked = state.settings.proxyEnabled;
  renderProxySummary();
  el('proxy-generate').disabled = !state.path || !window.api.available;
}

function applySettings(next) {
  // Never alias state.boot.settings: toolbar changes are optimistic, while the
  // boot copy is the last backend-confirmed rollback point.
  state.settings = { ...next };
  shortcutController.renderLabels();
  preview.setQuality(next.previewQuality);
  preview.setMuteWhileScrubbing(next.previewMuteWhileScrubbing);
  dom.previewQuality.value = next.previewQuality;
  dom.btnMagnet.classList.toggle('on', next.snap);
  stageController.syncEditorOverlay();
  stageController.renderStageOverlay();
  stageController.drawStageVisuals();
  // Rust applies settings to an active session before saveSettings returns.
  // The idempotent attach is only needed when there is no native monitor yet,
  // including the first bootstrap and a change away from media elements.
  if (!preview.usesNativeMonitor()) return attachMonitor(false);
  return Promise.resolve();
}

/** Ask Rust for a monitor, or give the one that is running a new box.
 *
 *  Called when a project opens, when the playback setting changes and when the
 *  window settles after a layout. `restart` is reserved for a different
 *  project; settings are reconfigured inside the running Rust session. */
async function attachMonitor(restart) {
  if (!preview) return;
  if (restart) {
    state.playbackNotice = null;
    await preview.release();
  }
  await preview.attach();
  // Attaching decides whether guides belong to Rust or the page. Re-evaluate
  // after the answer so native guides never leave the surface hidden behind an
  // exact DOM frame, while a media-element fallback still draws them here.
  stageController.syncEditorOverlay();
  stageController.renderStageOverlay();
  updateToolWarning();
  updateMonitorZoomUi();
  // Which engine is running decides who draws the text and shape layers, and
  // the answer only arrives here. Switching to the media elements has to put
  // the page's own copy back on the stage; switching away has to take it off.
  stageController.drawStageVisuals();
  stageController.scheduleExactFrame();
  // The note carries the fallback reason when a monitor refused to start, and
  // that is only known once the attach has answered.
  el('as-compositor-note').textContent = compositorNote(state.settings.compositor);
}

// --- menus -----------------------------------------------------------------

function closeMenus() {
  for (const list of dom.menus.querySelectorAll('.menu-list')) list.classList.remove('open');
  for (const title of dom.menus.querySelectorAll('.menu-title')) title.classList.remove('open');
  if (preview && !anySheetOpen()) preview.setVisible(true);
}

function openMenu(name) {
  const wasOpen = dom.menus.querySelector(`[data-list="${name}"]`).classList.contains('open');
  closeMenus();
  if (wasOpen) return;
  // A menu list can reach over the stage, and the native view would be on top
  // of it. Hidden while one is open, shown again by closeMenus.
  if (preview) preview.setVisible(false);
  dom.menus.querySelector(`[data-list="${name}"]`).classList.add('open');
  dom.menus.querySelector(`[data-menu="${name}"]`).classList.add('open');
}

const actions = {
  'new-project': newProject,
  'open-project': openProject,
  'save-project': () => saveProject(false),
  'save-project-as': () => saveProject(true),
  'import-assets': importViaDialog,
  'delete-project': deleteProject,
  'close-project': closeProject,
  undo: undoEdit,
  redo: redoEdit,
  split: splitAtPlayhead,
  'delete-clip': () => deleteSelected(false),
  'ripple-delete': () => deleteSelected(true),
  'toggle-playback': () => preview.toggle(),
  'previous-frame': () => seekTimelineOffset(-1),
  'next-frame': () => seekTimelineOffset(1),
  'previous-second': () => seekTimelineOffset(-Math.round(T.rateToNumber(rate()))),
  'next-second': () => seekTimelineOffset(Math.round(T.rateToNumber(rate()))),
  'previous-edit': seekPreviousEdit,
  'next-edit': seekNextEdit,
  'timeline-start': seekTimelineStart,
  'timeline-end': seekTimelineEnd,
  'monitor-zoom-in': () => { preview.zoomIn(); updateMonitorZoomUi(); },
  'monitor-zoom-out': () => { preview.zoomOut(); updateMonitorZoomUi(); },
  'monitor-fit': () => { preview.fit(); updateMonitorZoomUi(); },
  'monitor-fullscreen': () => stageController.toggleFullscreen(),
  'render-fhd': () => startRender('fhd'),
  'render-4k': () => startRender('4k'),
  'cancel-render': () => window.api.cancelRender(),
  'proxy-media': () => {
    fillProxySheet();
    openSheet('proxy-settings');
  },
  'project-settings': () => {
    fillProjectSheet();
    openSheet('project-settings');
  },
  'app-settings': () => {
    fillAppSheet();
    openSheet('app-settings');
  },
  'shortcut-settings': () => {
    shortcutController.fillSheet();
    openSheet('shortcut-settings');
  },
  'quality-soak': async () => {
    try {
      await globalThis.makevideoQuality.runAndSave();
    } catch (error) {
      await window.api.message(String(error), {
        title: 'Playback quality failed',
        kind: 'error',
      });
    }
  },
  'quality-smoke': async () => {
    try {
      await globalThis.makevideoQuality.runAndSave(qualitySmokeConfig());
    } catch (error) {
      await window.api.message(String(error), {
        title: 'Playback quality failed',
        kind: 'error',
      });
    }
  },
  'check-update': () => window.api.checkUpdate(),
  about: () =>
    window.api.message(
      [
        `akbun-makevideo ${state.boot.version}`,
        `settings: ${state.boot.dataDir}`,
        `ffmpeg: ${state.boot.ffmpeg || 'not found'}`,
        `ffprobe: ${state.boot.ffprobe || 'not found'}`,
        accelerationNote(),
        compositorNote(state.settings.compositor),
      ].join('\n'),
      { title: 'About' }
    ),
};

// --- wiring ----------------------------------------------------------------

function wireMenus() {
  dom.menus.addEventListener('click', (event) => {
    const title = event.target.closest('.menu-title');
    if (title) {
      openMenu(title.dataset.menu);
      return;
    }
    const item = event.target.closest('[data-action]');
    if (!item) return;
    closeMenus();
    const run = actions[item.dataset.action];
    if (run) Promise.resolve().then(run).catch((error) => reportError(error, `menu:${item.dataset.action}`));
  });
  dom.menus.addEventListener('pointerover', (event) => {
    const title = event.target.closest('.menu-title');
    if (!title) return;
    if (!dom.menus.querySelector('.menu-list.open')) return;
    closeMenus();
    openMenu(title.dataset.menu);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#menus')) closeMenus();
    if (!event.target.closest('#timeline-context-menu')) closeTimelineContextMenu();
  });
  // The webview brings its own right-click menu, and the first item on it is
  // Reload. The project lives in this page and nowhere else until it is saved,
  // so that one click empties the assets and the timeline with no warning.
  // Text fields keep their menu, because copy and paste belong there.
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('input, textarea')) event.preventDefault();
  });
}

function wireSelectedPanel() {
  dom.globalActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-panel-action]');
    if (button) toggleSelectedPanel(button.dataset.panelAction);
  });
  dom.btnRefreshDebug.addEventListener('click', () => void refreshDebug());
  dom.btnToggleLogs.addEventListener('click', () => {
    dom.debugLog.hidden = !dom.debugLog.hidden;
    dom.btnToggleLogs.textContent = dom.debugLog.hidden ? 'Show error log' : 'Hide error log';
    void refreshDebug();
  });
}

function wireAssets() {
  dom.btnImport.addEventListener('click', importViaDialog);
  dom.sourcePlay.addEventListener('click', () => sourcePreview.toggle());
  dom.sourceSeek.addEventListener('input', () => sourcePreview.seek(Number(dom.sourceSeek.value)));
  dom.sourceMarkIn.addEventListener('click', () => setSourceMark('in'));
  dom.sourceMarkOut.addEventListener('click', () => setSourceMark('out'));
  dom.sourceInsert.addEventListener('click', () => placeSource('insert'));
  dom.sourceOverwrite.addEventListener('click', () => placeSource('overwrite'));
  dom.sourceAppend.addEventListener('click', () => placeSource('append'));
  for (const input of [dom.sourceVideo, dom.sourceAudio, dom.sourceRipple]) {
    input.addEventListener('change', renderSourceMonitor);
  }
  dom.assetList.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      if (state.selectedAssetId === remove.dataset.remove) state.selectedAssetId = null;
      edit({ op: 'removeAsset', assetId: remove.dataset.remove });
      return;
    }
    const item = event.target.closest('.asset');
    if (!item) return;
    selectAsset(item.dataset.id);
  });
  dom.assetList.addEventListener('pointerdown', timelineInteractions.beginAssetDrag);
  dom.sourceStage.addEventListener('pointerdown', timelineInteractions.beginSourceDrag);
  dom.sourceStage.addEventListener('dragstart', (event) => event.preventDefault());
  window.addEventListener('pointermove', (event) => {
    timelineInteractions.updateAssetDrag(event);
    timelineInteractions.updateSourceDrag(event);
  });
  window.addEventListener('pointerup', timelineInteractions.endAssetDrag);
  window.addEventListener('pointerup', (event) => {
    timelineInteractions.endSourceDrag(event)
      .catch((error) => reportError(error, 'source:drop'));
  });
  window.addEventListener('pointercancel', () => {
    timelineInteractions.clearAssetDrag();
    timelineInteractions.clearSourceDrag();
    timelineInteractions.clearToolDrag();
  });
  window.addEventListener('blur', () => {
    timelineInteractions.clearAssetDrag();
    timelineInteractions.clearSourceDrag();
    timelineInteractions.clearToolDrag();
  });
}

function wireTimeline() {
  dom.zoom.addEventListener('input', () => {
    const at = preview.position();
    state.pxPerSecond = zoomToPxPerSecond(dom.zoom.value);
    renderTimeline();
    updatePlayhead(at);
  });
  dom.btnSplit.addEventListener('click', splitAtPlayhead);
  dom.btnMagnet.addEventListener('click', toggleSnap);
  dom.btnDelete.addEventListener('click', () => deleteSelected(false));
  dom.btnRipple.addEventListener('click', () => deleteSelected(true));
  dom.btnLink.addEventListener('click', toggleClipLink);
  // Wrapped so the click event never arrives as a placement, and skipped
  // entirely when it is the click that follows a drag.
  dom.btnAddText.addEventListener('click', () => {
    if (!timelineInteractions.tookToolDragClick()) addText();
  });
  for (const button of dom.shapeButtons) {
    button.addEventListener('click', () => {
      if (!timelineInteractions.tookToolDragClick()) addShape(button.dataset.addShape);
    });
    button.addEventListener('pointerdown', (event) => timelineInteractions.beginToolDrag(event, {
      kind: 'shape',
      shape: button.dataset.addShape,
      label: button.textContent.trim(),
    }));
  }
  dom.btnAddText.addEventListener('pointerdown', (event) => timelineInteractions.beginToolDrag(event, {
    kind: 'text',
    label: 'Text',
  }));
  dom.btnAddMarker.addEventListener('click', () => addMarker());
  dom.btnAddVideo.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'video' }));
  dom.btnAddAudio.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'audio' }));
  dom.btnAddSubtitle.addEventListener('click', async () => {
    await edit({ op: 'addTrack', trackKind: 'subtitle' });
    await addSubtitle();
  });
  dom.btnImportSrt.addEventListener('click', () => importSrt().catch((error) => reportError(error, 'subtitle:import')));
  dom.btnExportSrt.addEventListener('click', () => exportSrt().catch((error) => reportError(error, 'subtitle:export')));

  dom.heads.addEventListener('click', (event) => {
    const target = event.target.closest('[data-target-track]');
    if (target) {
      state.targetTrackId = state.targetTrackId === target.dataset.targetTrack
        ? null
        : target.dataset.targetTrack;
      renderHeads();
      return;
    }
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    const track = L.findTrack(state.project, button.closest('.head').dataset.trackId);
    if (!track) return;
    const flag = button.dataset.toggle;
    edit({ op: 'setTrackFlags', trackId: track.id, [flag]: !track[flag] });
  });

  dom.ruler.addEventListener('pointerdown', timelineInteractions.beginScrub);
  dom.ruler.addEventListener('click', (event) => {
    const marker = event.target.closest('[data-marker-id]');
    const found = marker && L.findMarker(state.project, marker.dataset.markerId);
    if (found) preview.seek(found.frame);
  });
  dom.ruler.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const frame = Math.round(frameAtClientX(event.clientX));
    openTimelineContextMenu(event, [
      { label: 'Move Playhead Here', run: () => preview.seek(frame) },
      { label: 'Add Marker Here', run: () => addMarker(frame) },
    ]);
  });
  dom.markerList.addEventListener('click', (event) => {
    const seek = event.target.closest('[data-marker-seek]');
    if (seek) {
      const marker = L.findMarker(state.project, seek.dataset.markerSeek);
      if (marker) preview.seek(marker.frame);
      return;
    }
    const remove = event.target.closest('[data-marker-remove]');
    if (remove) edit({ op: 'removeMarker', markerId: remove.dataset.markerRemove });
  });
  dom.markerList.addEventListener('change', (event) => {
    const color = event.target.closest('[data-marker-color]');
    if (color) edit({ op: 'setMarker', markerId: color.dataset.markerColor, color: color.value });
  });
  dom.markerList.addEventListener('focusout', (event) => {
    const name = event.target.closest('[data-marker-name]');
    if (!name) return;
    const marker = L.findMarker(state.project, name.dataset.markerName);
    if (marker && marker.name !== name.value) {
      edit({ op: 'setMarker', markerId: marker.id, name: name.value });
    }
  });
  inspectorController.wire();
  dom.lanes.addEventListener('pointerdown', (event) => {
    const visual = event.target.closest('[data-visual-item-id]');
    if (visual) {
      timelineInteractions.beginVisualItemDrag(event, visual);
      return;
    }
    const clip = event.target.closest('.clip');
    if (clip) {
      timelineInteractions.beginClipDrag(event, clip);
      return;
    }
    stageController.selectClip(null);
    stageController.selectVisualItem(null);
    timelineInteractions.beginScrub(event);
  });
  dom.lanes.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const visual = event.target.closest('[data-visual-item-id]');
    if (visual) {
      stageController.selectVisualItem(visual.dataset.visualItemId);
      openTimelineContextMenu(event, [
        { label: 'Delete Layer', run: () => inspectorController.removeSelectedVisualItem() },
      ]);
      return;
    }
    const clip = event.target.closest('.clip');
    if (clip) {
      stageController.selectClip(clip.dataset.clipId);
      openTimelineContextMenu(event, [
        { label: 'Apply 3D LUT…', run: () => setClipLut(clip.dataset.clipId) },
        ...(L.findClip(state.project, clip.dataset.clipId).clip.lutPath
          ? [{ label: 'Remove 3D LUT', run: () => edit({ op: 'setClipLut', clipId: clip.dataset.clipId, lutPath: null }) }]
          : []),
        { label: 'Delete Clip', run: () => deleteSelected(false) },
        { label: 'Ripple Delete', run: () => deleteSelected(true) },
      ]);
      return;
    }
    const lane = event.target.closest('.lane');
    if (!lane) return;
    const track = L.findTrack(state.project, lane.dataset.trackId);
    const gap = L.gapAt(track, frameAtClientX(event.clientX));
    if (!gap) return;
    stageController.selectClip(null);
    openTimelineContextMenu(event, [
      {
        label: 'Ripple Delete Gap',
        run: () => edit({ op: 'rippleDeleteGap', trackId: track.id, start: gap.start, end: gap.end }),
      },
    ]);
  });

  window.addEventListener('pointermove', (event) => {
    timelineInteractions.pointerMove(event);
  });
  window.addEventListener('pointerup', (event) => {
    timelineInteractions.pointerUp(event, reportError);
  });
}

function wireSheets() {
  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close]');
    if (close) closeSheet(close.dataset.close);
  });
  el('ps-preset').addEventListener('change', (event) => {
    if (event.target.value === 'custom') return;
    const [width, height] = event.target.value.split('x');
    el('ps-width').value = width;
    el('ps-height').value = height;
  });
  el('ps-save').addEventListener('click', async () => {
    const at = preview.position();
    const was = rate();
    closeSheet('project-settings');
    // Changing the rate carries every clip with it, so a cut stays where it
    // was in time rather than where it was in frame numbers. That is one
    // command over every clip in the project, and one press of undo back.
    await edit({
      op: 'setSettings',
      settings: {
        width: Math.max(16, Number(el('ps-width').value) || 1920),
        height: Math.max(16, Number(el('ps-height').value) || 1080),
        rate: T.parseRate(el('ps-rate').value),
      },
    });
    preview.seek(T.rescale(at, was, rate()));
    preview.layout();
  });
  // The device list only means anything on the GPU setting, and the sheet says
  // so as soon as the choice is made rather than after it is applied.
  el('as-compositor').addEventListener('change', (event) => {
    el('as-compositor-note').textContent = compositorNote(event.target.value);
    void fillGraphicsDevices();
  });
  el('as-save').addEventListener('click', async () => {
    const next = Object.assign({}, state.settings, {
      previewQuality: el('as-quality').value,
      previewMuteWhileScrubbing: el('as-scrub-mute').checked,
      snap: el('as-snap').checked,
      showActionSafeArea: el('as-action-safe-area').checked,
      showTitleSafeArea: el('as-title-safe-area').checked,
      showRuleOfThirds: el('as-rule-of-thirds').checked,
      showCenterLines: el('as-center-lines').checked,
      theme: el('as-theme').value,
      compositor: el('as-compositor').value,
      gpuDevice: el('as-gpu-device').value,
      proxyEnabled: state.settings.proxyEnabled,
      renderAcceleration: el('as-accel').value,
      workspaceDir: el('as-workspace').value.trim(),
      deleteProjectFolder: el('as-delete-project-folder').checked,
      ffmpegDir: el('as-ffmpeg').value.trim(),
      logDir: el('as-log-dir').value.trim(),
      logRotationSize: Math.min(
        1024,
        Math.max(1, Math.floor(Number(el('as-log-size').value) || 5)),
      ),
      logRotationUnit: el('as-log-unit').value,
    });
    closeSheet('app-settings');
    await persistSettings(next, {
      fail: async (error) => {
        reportError(error, 'settings:save');
        await window.api.message(`Those settings could not be saved.\n\n${error}`, {
          title: 'Settings',
          kind: 'error',
        });
      },
    });
  });
  el('shortcut-save').addEventListener('click', async () => {
    const error = el('shortcut-error');
    let shortcutOverrides;
    try {
      shortcutOverrides = shortcutController.collectOverrides();
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
      return;
    }
    await persistSettings(Object.assign({}, state.settings, { shortcutOverrides }), {
      confirm: () => closeSheet('shortcut-settings'),
      fail: (cause) => {
        reportError(cause, 'settings:shortcuts');
        error.textContent = `Those shortcuts could not be saved. ${cause}`;
        error.hidden = false;
      },
    });
  });
  el('proxy-generate').addEventListener('click', async () => {
    if (!state.path) return;
    try {
      adoptProxyStatuses(await window.api.startProxies(state.path));
    } catch (error) {
      reportError(error, 'proxy:generate');
      await window.api.message(`Proxy generation could not start.\n\n${error}`, {
        title: 'Proxy Media',
        kind: 'error',
      });
    }
  });
  el('proxy-save').addEventListener('click', async () => {
    const next = Object.assign({}, state.settings, {
      proxyEnabled: el('proxy-enabled').checked,
    });
    closeSheet('proxy-settings');
    await persistSettings(next, {
      fail: async (error) => {
        reportError(error, 'settings:proxy');
        await window.api.message(`The proxy setting could not be saved.\n\n${error}`, {
          title: 'Proxy Media',
          kind: 'error',
        });
      },
    });
  });
  el('as-workspace-pick').addEventListener('click', async () => {
    const folder = await window.api.pickFolder('Workspace folder');
    if (folder) el('as-workspace').value = folder;
  });
  el('as-log-dir-pick').addEventListener('click', async () => {
    const folder = await window.api.pickFolder('Error log folder');
    if (folder) el('as-log-dir').value = folder;
  });
  el('np-create').addEventListener('click', createProjectFromSheet);
  el('np-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createProjectFromSheet();
  });
  el('op-list').addEventListener('click', (event) => {
    const row = event.target.closest('[data-path]');
    if (row) openProjectPath(row.dataset.path);
  });
  el('op-browse').addEventListener('click', async () => {
    const path = await window.api.pickProjectOpen();
    if (path) openProjectPath(path);
  });
  dom.renderCancel.addEventListener('click', () => window.api.cancelRender());
  dom.renderClose.addEventListener('click', () => {
    dom.renderOverlay.hidden = true;
  });
  dom.toolWarning.addEventListener('click', () => {
    fillAppSheet();
    openSheet('app-settings');
  });
}

function updateToolWarning() {
  dom.toolWarning.hidden = Boolean(state.boot && state.boot.ffmpeg);
  if (!dom.playbackWarning) return;
  dom.playbackWarning.hidden = !state.playbackNotice;
  dom.playbackWarning.textContent = state.playbackNotice
    ? `Playback is using media elements: ${state.playbackNotice}`
    : '';
  // The bar is narrow and the reason can be a sentence, so the element is
  // truncated and the whole of it lives in the tooltip.
  dom.playbackWarning.title = state.playbackNotice || '';
}

function subscribe(source, register, handler) {
  try {
    Promise.resolve(register(handler)).catch((error) => reportError(error, source));
  } catch (error) {
    reportError(error, source);
  }
}

// One name, so diagnostics in Web Inspector do not shadow anything else on the page.
globalThis.makevideo = {
  state,
  refresh,
  preview: () => preview,
  lib: L,
};

const appInitializer = globalThis.appInitLib.createAppInitializer({
  DEFAULT_SETTINGS,
  G,
  HANDLE_PX,
  I,
  K,
  L,
  P,
  S,
  T,
  X,
  actions,
  activateSelectedPanel,
  addShape,
  addText,
  adopt,
  applySettings,
  baseName,
  closeMenus,
  closeTimelineContextMenu,
  confirmDiscard,
  dom,
  edit,
  el,
  followPlayhead,
  frameAtClientX,
  hydrateDuration,
  insertSourceAt,
  isDirty,
  liveSelection,
  onProxyStatus,
  onRenderDone,
  onRenderFallback,
  onRenderProgress,
  onWaveformStatus,
  openProjectPath,
  persistSettingsInBackground,
  playbackPath,
  probePaths,
  qualitySmokeConfig,
  rate,
  refresh,
  renderTimeline,
  reportError,
  selectAsset,
  selectedSourceAsset,
  setRuntime,
  snapTolerance,
  sourceDragPayload,
  sourceTime,
  state,
  staysOnCpu,
  subscribe,
  updateLinkUi,
  updateMonitorZoomUi,
  updatePlayhead,
  updateToolWarning,
  wireAssets,
  wireMenus,
  wireSelectedPanel,
  wireSheets,
  wireTimeline,
  zoomToPxPerSecond,
});

appInitializer.start().catch((error) => reportError(error, 'ui-initialization'));
})();
