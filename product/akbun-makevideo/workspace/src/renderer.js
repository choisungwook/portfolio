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
  btnAddShape: el('btn-add-shape'),
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
  textColor: el('text-color'),
  textAlign: el('text-align'),
  textStrokeColor: el('text-stroke-color'),
  textStrokeWidth: el('text-stroke-width'),
  textShadowColor: el('text-shadow-color'),
  shapePanel: el('shape-panel'),
  shapeKind: el('shape-kind'),
  shapeFill: el('shape-fill'),
  shapeStroke: el('shape-stroke'),
  shapeStrokeWidth: el('shape-stroke-width'),
  shapeCornerRadius: el('shape-corner-radius'),
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
let visualDrag = null;
let editorOverlayActive = false;
let stageResizeObserver = null;

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
    if (proxy.state === 'ready') bits.push('proxy ready');
    else if (proxy.state === 'failed') bits.push('proxy failed');
    else bits.push(`proxy ${proxy.percent || 0}%`);
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
  if (!statuses.length) return 'No 4K media needs a proxy.';
  const count = (name) => statuses.filter((status) => status.state === name).length;
  const ready = count('ready');
  const active = count('queued') + count('generating');
  const failed = count('failed');
  return [`${ready} ready`, active ? `${active} generating` : '', failed ? `${failed} failed` : '']
    .filter(Boolean)
    .join(' · ');
}

function renderProxySummary() {
  const summary = el('proxy-summary');
  if (summary) summary.textContent = proxySummary();
}

function renderProxyProgress() {
  const statuses = Object.values(state.proxies);
  const active = statuses.filter((status) => status.state === 'queued' || status.state === 'generating');
  if (!active.length) {
    dom.proxyProgress.hidden = true;
    return;
  }
  const percent = Math.round(active.reduce((total, status) => total + (status.percent || 0), 0) / active.length);
  dom.proxyProgress.textContent = `Proxy ${percent}% · ${active.length} processing`;
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

async function refreshDebug() {
  if (dom.debugPanel.hidden || debugRefreshInFlight) return;
  debugRefreshInFlight = true;
  try {
    const [metrics, playback, logs] = await Promise.all([
      window.api.processMetrics(),
      window.api.playbackStatus(),
      dom.debugLog.hidden ? Promise.resolve(null) : window.api.readErrorLog(),
    ]);
    const active = Object.values(state.proxies).filter((status) => status.state === 'queued' || status.state === 'generating');
    dom.debugMetrics.textContent = [
      `Process tree CPU: ${Number.isFinite(metrics.cpuPercent) ? `${metrics.cpuPercent.toFixed(1)}%` : 'unavailable'}`,
      `Process tree memory: ${byteText(metrics.memoryBytes)}`,
      `Timeline: ${state.project.tracks.length} tracks, ${state.project.assets.length} assets`,
      `Proxy jobs: ${active.length} active, ${Object.keys(state.proxies).length} known`,
      `Compositor: ${state.settings.compositor || 'not read yet'}`,
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
    button.setAttribute('aria-expanded', String(active));
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
  if (state.selectedVisualItemId && !selectedVisualItem()) selectVisualItem(null);
  renderHeads();
  renderRuler();
  renderLanes();
  renderMarkerList();
  renderInspector();
  updatePlayhead(preview ? preview.position() : 0);
  dom.duration.textContent = L.formatTimecode(L.projectDurationFrames(state.project), rate());
  dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
  dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddSubtitle.disabled = L.tracksOf(state.project, 'subtitle').length >= 1;
  updateLinkUi();
  updateHistoryUi();
  updateMonitorZoomUi();
  renderStageOverlay();
  scheduleExactFrame();
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
  syncEditorOverlay();
  renderStageOverlay();
  drawStageVisuals();
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

// --- the exact frame -------------------------------------------------------

let exactTimer = null;
let exactToken = 0;

function setStageMode(mode) {
  if (!dom.stageMode) return;
  // The badge exists to say which of two pictures is on screen. On the native
  // monitor there is only one — the same compositor draws the stopped frame and
  // the playing ones — so there is nothing to tell apart and nothing to show.
  const known = (mode === 'exact' || mode === 'live') &&
    (!preview.usesNativeMonitor() || editorOverlayActive);
  dom.stageMode.hidden = !known || L.projectDurationFrames(state.project) <= 0;
  dom.stageMode.textContent = mode === 'exact' ? 'exact frame' : 'live preview';
  dom.stageMode.classList.toggle('exact', mode === 'exact');
}

/** Ask Rust for the frame the render would produce here. It costs an ffmpeg
 *  call per visible clip, so it is only ever asked for when the playhead has
 *  stopped, and a newer request cancels an older one by token. */
async function requestExactFrame() {
  if (!window.api.available) return;
  if (preview.usesNativeMonitor() && !editorOverlayActive) return;
  if (preview.isPlaying() || preview.mode() !== 'timeline') return;
  if (L.projectDurationFrames(state.project) <= 0) return;
  if (staysOnCpu()) return;
  const token = (exactToken += 1);
  const box = dom.stageInner.getBoundingClientRect();
  const maxWidth = Math.max(160, Math.round(box.width));
  try {
    const drawn = await window.api.previewFrame(Math.round(preview.position()), maxWidth);
    if (token !== exactToken || preview.isPlaying()) return;
    setStageMode(preview.showExact(drawn) ? 'exact' : 'live');
    // The exact frame already contains the text and shape layers, drawn by
    // the same Rust code the render uses; the page's copy comes off.
    drawStageVisuals();
  } catch (error) {
    // No graphics device, no ffmpeg, or a source that will not decode. The
    // stacked elements are still showing something, so this is not worth a
    // dialog; the badge keeps saying "live".
    setStageMode('live');
  }
}

function scheduleExactFrame() {
  if (!window.api.available) return;
  window.clearTimeout(exactTimer);
  if (preview.usesNativeMonitor() && !editorOverlayActive) return;
  if (preview.isPlaying() || preview.mode() !== 'timeline') return;
  exactTimer = window.setTimeout(requestExactFrame, 180);
}

// --- selection and editing -------------------------------------------------

function selectClip(clipId) {
  state.selectedClipId = clipId;
  const targets = clipId ? I.clipTargets(state.project, clipId) : null;
  if (targets) state.inspectorTab = I.activeTab(targets);
  // One selection at a time, so the inspector always shows the thing that was
  // picked last rather than whichever kind happens to win a tie.
  if (clipId && state.selectedVisualItemId) selectVisualItem(null);
  for (const node of dom.lanes.querySelectorAll('.clip')) {
    node.classList.toggle('selected', node.dataset.clipId === clipId);
  }
  updateLinkUi();
  renderInspector();
}

function selectedVisualItem() {
  if (!state.selectedVisualItemId) return null;
  for (const track of state.project.tracks) {
    const item = (track.visualItems || []).find((entry) => entry.id === state.selectedVisualItemId);
    if (item) return item;
  }
  return null;
}

function projectPointAt(event) {
  const box = dom.stage.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  return X.projectPoint(
    { x: event.clientX - box.left, y: event.clientY - box.top },
    box,
    state.project.settings
  );
}

function overlayScale() {
  const box = dom.stage.getBoundingClientRect();
  return Math.min(
    box.width / Math.max(1, state.project.settings.width),
    box.height / Math.max(1, state.project.settings.height)
  );
}

function selectVisualItem(itemId) {
  state.selectedVisualItemId = itemId || null;
  if (itemId) state.inspectorTab = 'video';
  if (itemId && state.selectedClipId) selectClip(null);
  for (const node of dom.lanes.querySelectorAll('[data-visual-item-id]')) {
    node.classList.toggle('selected', node.dataset.visualItemId === state.selectedVisualItemId);
  }
  renderInspector();
  syncEditorOverlay();
  renderStageOverlay();
}

function editorOverlayWanted() {
  return Boolean(
    preview &&
    preview.mode() === 'timeline' &&
    (G.visible(state.settings) || (state.selectedVisualItemId && !preview.isPlaying()))
  );
}

function syncEditorOverlay() {
  const active = editorOverlayWanted();
  dom.stage.classList.toggle('editing', Boolean(state.selectedVisualItemId));
  if (active === editorOverlayActive) return;
  editorOverlayActive = active;
  preview.setEditing(active);
  if (active) scheduleExactFrame();
  else {
    preview.clearExact();
    preview.redraw();
  }
}

function renderStageOverlay() {
  const canvas = dom.stageOverlay;
  const item = selectedVisualItem();
  const showGuides = G.visible(state.settings);
  if (!canvas || (!item && !showGuides)) {
    if (canvas) canvas.width = 0;
    return;
  }
  const box = dom.stage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  if (showGuides) G.draw(context, state.settings, box.width, box.height);
  if (!item) return;
  const transform = item.transform;
  const center = X.displayPoint(X.centre(transform), box, state.project.settings);
  const size = {
    x: (transform.width * box.width) / state.project.settings.width,
    y: (transform.height * box.height) / state.project.settings.height,
  };
  const scale = overlayScale();
  const handleRadius = 5;
  context.save();
  context.translate(center.x, center.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.strokeStyle = '#4e9bff';
  context.lineWidth = 1.5;
  context.setLineDash([5, 3]);
  context.strokeRect(-size.x / 2, -size.y / 2, size.x, size.y);
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(0, -size.y / 2);
  context.lineTo(0, -size.y / 2 - 24);
  context.stroke();
  context.restore();
  const handles = X.handlePoints(transform, 24 / scale);
  for (const [name, point] of Object.entries(handles)) {
    const at = X.displayPoint(point, box, state.project.settings);
    context.beginPath();
    context.arc(at.x, at.y, name === 'rotate' ? 6 : handleRadius, 0, Math.PI * 2);
    context.fillStyle = name === 'rotate' ? '#4e9bff' : '#ffffff';
    context.fill();
    context.strokeStyle = '#4e9bff';
    context.lineWidth = 1.5;
    context.stroke();
  }
}

// --- text and shape layers on the stage -------------------------------------

/** Draw the text and shape layers over the stacked media elements.
 *
 *  This is the page's approximation of the Rust compositor, and it exists for
 *  the one display the Rust picture cannot reach: the media element engine
 *  while it is playing. The paused stage shows the exact frame — the Rust
 *  picture, which already contains these layers — and the native monitor
 *  composites them in Rust, so both of those clear this canvas instead.
 *
 *  Like the preview itself, this is an approximation of the render: line
 *  breaks and glyph metrics come from the browser rather than from fontdue.
 *  Rotation is deliberately not drawn, because the Rust compositor does not
 *  draw it either, and the preview's job is to look like the render. */
function drawStageVisuals() {
  const canvas = dom.stageVisuals;
  if (!canvas) return;
  const clear = () => {
    if (canvas.width > 0 || canvas.height > 0) {
      canvas.width = 0;
      canvas.height = 0;
    }
  };
  if (!preview || preview.mode() !== 'timeline') return clear();
  if (preview.usesNativeMonitor() && !editorOverlayActive) return clear();
  if (preview.isExact()) return clear();
  const box = dom.stage.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return clear();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const settings = state.project.settings;
  const scales = {
    x: box.width / Math.max(1, settings.width),
    y: box.height / Math.max(1, settings.height),
  };
  scales.font = Math.min(scales.x, scales.y);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  const frame = Math.floor(preview.position());
  // Tracks in project order: V1 first, which is the bottom layer, the same
  // order the Rust compositor takes them in.
  for (const track of state.project.tracks) {
    if (track.hidden) continue;
    if (track.kind !== 'video' && track.kind !== 'subtitle') continue;
    const items = (track.visualItems || [])
      .filter((item) => item.start <= frame && frame < item.start + item.duration)
      .sort((a, b) => a.zIndex - b.zIndex);
    for (const item of items) drawVisualItem(context, track, item, scales);
  }
}

function drawVisualItem(context, track, item, scales) {
  const settings = state.project.settings;
  // A subtitle ignores its own transform and sits in the lower third, exactly
  // as compositor/text.rs places it.
  const transform = track.kind === 'subtitle'
    ? { x: 96, y: settings.height * 0.78, width: settings.width - 192, height: settings.height * 0.16, opacity: 1 }
    : item.transform;
  const x = transform.x * scales.x;
  const y = transform.y * scales.y;
  const width = Math.max(1, transform.width * scales.x);
  const height = Math.max(1, transform.height * scales.y);
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, transform.opacity ?? 1));
  context.translate(x, y);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  const content = item.content || {};
  if (content.kind === 'shape') {
    drawShapeContent(context, content, width, height, scales.font);
  } else if (content.kind === 'text') {
    const style = (track.kind === 'subtitle' && track.subtitleStyle) || content.style || {};
    drawTextContent(context, content.text || '', style, width, height, scales.font);
  }
  context.restore();
}

function cssFontFamily(family) {
  const generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'];
  return generic.includes(family) ? family : `"${String(family).replace(/"/g, '')}"`;
}

function wrapVisualText(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawTextContent(context, text, style, width, height, scale) {
  const size = Math.max(1, (style.fontSize || 64) * scale);
  context.font = `${size}px ${cssFontFamily(style.fontFamily || 'sans-serif')}`;
  const align = style.align || 'center';
  context.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  context.textBaseline = 'alphabetic';
  const anchorX = align === 'left' ? 0 : align === 'right' ? width : width / 2;
  const strokeWidth = Math.max(0, (style.strokeWidth || 0) * scale);
  const shadowColor = style.shadowColor || '';
  const lines = wrapVisualText(context, text, width);
  for (let index = 0; index < lines.length; index += 1) {
    const baseline = index * size * 1.2 + size;
    if (baseline - size > height) break;
    if (shadowColor) {
      context.shadowColor = shadowColor;
      context.shadowOffsetX = (style.shadowX ?? 2) * scale;
      context.shadowOffsetY = (style.shadowY ?? 2) * scale;
    }
    if (strokeWidth > 0 && style.strokeColor) {
      // The Rust pass dilates by the radius, so the visible rim is the radius
      // wide; a canvas stroke straddles the edge, so it is doubled to match.
      context.lineWidth = strokeWidth * 2;
      context.lineJoin = 'round';
      context.strokeStyle = style.strokeColor;
      context.strokeText(lines[index], anchorX, baseline);
    }
    context.fillStyle = style.color || '#ffffff';
    context.fillText(lines[index], anchorX, baseline);
    context.shadowColor = 'transparent';
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
  }
}

function drawShapeContent(context, content, width, height, scale) {
  const stroke = content.stroke || '#ffffff';
  const strokeWidth = Math.max(0, (content.strokeWidth ?? 4) * scale);
  const kind = content.shape || 'rectangle';
  if (kind === 'line') {
    // A line is all stroke: a bar through the middle, plus the arrow heads.
    // Nothing is drawn at width zero, the same rule the Rust rasterizer has.
    if (strokeWidth <= 0) return;
    const middle = height / 2;
    const half = strokeWidth / 2;
    const arrow = Math.max(strokeWidth * 1.5, 8);
    context.fillStyle = stroke;
    context.fillRect(half, middle - half, Math.max(0, width - strokeWidth), strokeWidth);
    const head = (tipX, direction) => {
      context.beginPath();
      context.moveTo(tipX, middle);
      context.lineTo(tipX + direction * arrow, middle - arrow * 0.65);
      context.lineTo(tipX + direction * arrow, middle + arrow * 0.65);
      context.closePath();
      context.fill();
    };
    if (content.startArrow) head(0, 1);
    if (content.endArrow) head(width, -1);
    return;
  }
  context.beginPath();
  if (kind === 'ellipse') {
    context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else {
    const radius = Math.min(Math.max(0, (content.cornerRadius ?? 0) * scale), Math.min(width, height) / 2);
    context.roundRect(0, 0, width, height, radius);
  }
  context.fillStyle = content.fill || '#4f8cffcc';
  context.fill();
  if (strokeWidth > 0) {
    // The Rust outline is a band half the width lying inside the edge, so the
    // stroke is clipped to the shape — which throws away its outer half and
    // leaves the same half-width rim.
    context.save();
    context.clip();
    context.lineWidth = strokeWidth;
    context.strokeStyle = stroke;
    context.stroke();
    context.restore();
  }
}

function beginVisualDrag(event) {
  if (event.button !== 0 || preview.isPlaying()) return false;
  const point = projectPointAt(event);
  if (!point) return false;
  const scale = overlayScale();
  const hit = X.hitItem(
    state.project,
    Math.round(preview.position()),
    point,
    state.selectedVisualItemId,
    { handleRadius: 8 / scale, rotateOffset: 24 / scale }
  );
  if (!hit) {
    selectVisualItem(null);
    return false;
  }
  if (hit.item.id !== state.selectedVisualItemId) selectVisualItem(hit.item.id);
  visualDrag = {
    itemId: hit.item.id,
    action: hit.action === 'resize' ? hit.handle : hit.action,
    initial: { ...hit.item.transform },
    start: point,
    next: { ...hit.item.transform },
  };
  dom.stage.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}

function updateVisualDrag(event) {
  if (!visualDrag) return;
  const point = projectPointAt(event);
  if (!point) return;
  visualDrag.next = X.transformForDrag(
    visualDrag.initial,
    visualDrag.action,
    visualDrag.start,
    point
  );
  const item = selectedVisualItem();
  if (item) item.transform = visualDrag.next;
  renderStageOverlay();
  // The page's own copy of the layer moves with the handles. Without this the
  // dashed box slides away from the shape it is supposed to be around, until
  // the drag ends and the redraw catches up.
  drawStageVisuals();
}

async function endVisualDrag(event) {
  if (!visualDrag) return;
  const finished = visualDrag;
  visualDrag = null;
  if (dom.stage.hasPointerCapture(event.pointerId)) dom.stage.releasePointerCapture(event.pointerId);
  if (JSON.stringify(finished.initial) === JSON.stringify(finished.next)) return;
  await edit({ op: 'setVisualTransform', itemId: finished.itemId, transform: finished.next });
  selectVisualItem(finished.itemId);
}

function cancelVisualDrag() {
  if (!visualDrag) return;
  const item = selectedVisualItem();
  if (item) item.transform = visualDrag.initial;
  visualDrag = null;
  renderStageOverlay();
  drawStageVisuals();
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
  renderInspector();
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

/** The video track a new text or shape lands on: the one it was dropped on,
 *  else the targeted track, else the first video track. */
function visualTargetTrack(placement) {
  if (placement) {
    const track = L.findTrack(state.project, placement.trackId);
    return track && track.kind === 'video' ? track : null;
  }
  const target = state.targetTrackId && L.findTrack(state.project, state.targetTrackId);
  return target && target.kind === 'video' ? target : L.tracksOf(state.project, 'video')[0];
}

/** Add a visual item and select what Rust made of it. `placement` is
 *  `{ trackId, frame }` from a drop; without one the item lands on the
 *  targeted track at the playhead. */
async function addVisualItem(placement, content, transform) {
  const track = visualTargetTrack(placement);
  if (!track) return;
  const known = new Set((track.visualItems || []).map((item) => item.id));
  await edit({
    op: 'addVisualItem',
    trackId: track.id,
    content,
    start: placement ? Math.round(placement.frame) : Math.round(preview.position()),
    duration: L.defaultVisualItemFrames(rate()),
    transform: { ...transform, rotation: 0, opacity: 1 },
    zIndex: 0,
  });
  const liveTrack = L.findTrack(state.project, track.id);
  const item = (liveTrack && liveTrack.visualItems || []).find((entry) => !known.has(entry.id));
  if (item) selectVisualItem(item.id);
}

function addText(placement) {
  return addVisualItem(placement, {
    kind: 'text',
    text: 'Title',
    style: {
      fontFamily: 'sans-serif', fontSize: 64, color: '#ffffff', align: 'center',
      strokeColor: '', strokeWidth: 0, shadowColor: '#00000080', shadowX: 2, shadowY: 2,
    },
  }, {
    x: state.project.settings.width * 0.1,
    y: state.project.settings.height * 0.12,
    width: state.project.settings.width * 0.8,
    height: state.project.settings.height * 0.2,
  });
}

function addShape(placement) {
  return addVisualItem(placement, {
    kind: 'shape', shape: 'rectangle', fill: '#4f8cffcc', stroke: '#ffffff',
    strokeWidth: 4, cornerRadius: 20, startArrow: false, endArrow: false,
  }, {
    x: state.project.settings.width * 0.3,
    y: state.project.settings.height * 0.3,
    width: state.project.settings.width * 0.4,
    height: state.project.settings.height * 0.25,
  });
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
  if (item) selectVisualItem(item.id);
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

function hexColor(value, fallback) {
  const match = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(value || '');
  return match ? `#${match[1]}` : fallback;
}

function preserveAlpha(color, previous) {
  const alpha = /^#[0-9a-fA-F]{8}$/.test(previous || '') ? previous.slice(7) : '';
  return `${color}${alpha}`;
}

function inspectorMessage(tab, item, clipTargets) {
  if (tab === 'effects') return 'No effect is selected.';
  if (tab === 'transition') return 'No transition is selected.';
  if (tab === 'image') {
    const asset = L.findAsset(state.project, state.selectedAssetId);
    return asset && asset.kind === 'image'
      ? `Image — ${asset.name || baseName(asset.path)}`
      : 'Select an image asset to inspect it.';
  }
  if (tab === 'file') {
    const selected = clipTargets && clipTargets.selected;
    const asset = selected
      ? L.findAsset(state.project, selected.clip.assetId)
      : L.findAsset(state.project, state.selectedAssetId);
    return asset ? `File — ${asset.name || baseName(asset.path)}` : 'Select an asset or clip to inspect its file.';
  }
  if (tab === 'audio') return 'Select a clip with audio properties.';
  return item ? 'No video properties are available.' : 'Select a clip or a layer to edit its properties.';
}

/** The inspector beside the preview. One switch over what is selected: a text,
 *  shape or subtitle layer, else the selected clip, else the empty hint. */
function renderInspector() {
  const item = selectedVisualItem();
  const text = item && item.content && item.content.kind === 'text' ? item.content : null;
  const shape = item && item.content && item.content.kind === 'shape' ? item.content : null;
  const track = item && state.project.tracks.find((candidate) => (candidate.visualItems || []).some((entry) => entry.id === item.id));
  const subtitle = track && track.kind === 'subtitle';
  const clipTargets = !item && liveSelection()
    ? I.clipTargets(state.project, liveSelection())
    : null;
  const clip = clipTargets && clipTargets.selected;
  const tab = state.inspectorTab || 'video';
  const video = tab === 'video';
  const audio = tab === 'audio';
  const hasProperties = (video && Boolean(item || (clipTargets && clipTargets.video))) ||
    (audio && Boolean(clipTargets && clipTargets.audio));
  dom.textPanel.hidden = !video || !text || subtitle;
  dom.subtitlePanel.hidden = !video || !text || !subtitle;
  dom.shapePanel.hidden = !video || !shape;
  dom.clipPanel.hidden = !clip || (!video && !audio);
  dom.transformPanel.hidden = !video || !item;
  dom.inspectorEmpty.hidden = hasProperties;
  dom.inspectorEmpty.textContent = inspectorMessage(tab, item, clipTargets);
  for (const button of dom.panelTabBar.querySelectorAll('[data-inspector-tab]')) {
    const active = button.dataset.inspectorTab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  if (item) {
    const transform = item.transform;
    dom.transformX.value = transform.x;
    dom.transformY.value = transform.y;
    dom.transformWidth.value = transform.width;
    dom.transformHeight.value = transform.height;
    dom.transformRotation.value = transform.rotation;
    dom.transformOpacity.value = transform.opacity;
    dom.transformOpacityValue.value = transform.opacity;
  }
  if (clip) {
    const asset = L.findAsset(state.project, clip.clip.assetId);
    dom.clipSummary.textContent = `${asset ? asset.name || baseName(asset.path) : 'missing file'} · ${clip.track.name}`;
    dom.clipVideoPanel.hidden = !video || !clipTargets.video;
    dom.clipAudioPanel.hidden = !audio || !clipTargets.audio;
    if (clipTargets.video) dom.clipOpacity.value = String(clipTargets.video.clip.opacity ?? 1);
    if (clipTargets.audio) dom.clipVolume.value = String(clipTargets.audio.clip.volume ?? 1);
  }
  if (shape) {
    dom.shapeKind.value = shape.shape || 'rectangle';
    dom.shapeFill.value = hexColor(shape.fill, '#4f8cff');
    dom.shapeStroke.value = hexColor(shape.stroke, '#ffffff');
    dom.shapeStrokeWidth.value = shape.strokeWidth ?? 4;
    dom.shapeCornerRadius.value = shape.cornerRadius ?? 0;
    dom.shapeStartArrow.checked = Boolean(shape.startArrow);
    dom.shapeEndArrow.checked = Boolean(shape.endArrow);
  }
  if (!text) return;
  if (subtitle) {
    dom.subtitleValue.value = text.text || '';
    dom.subtitleStart.value = item.start;
    dom.subtitleEnd.value = item.start + item.duration;
    const subtitleStyle = track.subtitleStyle || {};
    dom.subtitleFont.value = subtitleStyle.fontFamily || 'sans-serif';
    dom.subtitleSize.value = subtitleStyle.fontSize || 64;
    dom.subtitleColor.value = hexColor(subtitleStyle.color, '#ffffff');
    return;
  }
  const style = text.style || {};
  dom.textValue.value = text.text || '';
  dom.textFont.value = style.fontFamily || 'sans-serif';
  dom.textSize.value = style.fontSize || 64;
  dom.textColor.value = hexColor(style.color, '#ffffff');
  dom.textAlign.value = style.align || 'center';
  dom.textStrokeColor.value = hexColor(style.strokeColor, '#000000');
  dom.textStrokeWidth.value = style.strokeWidth || 0;
  dom.textShadowColor.value = hexColor(style.shadowColor, '#000000');
}

function updateSelectedTransform(event) {
  const item = selectedVisualItem();
  if (!item) return;
  if (event && event.target === dom.transformOpacity) {
    dom.transformOpacityValue.value = dom.transformOpacity.value;
  } else if (event && event.target === dom.transformOpacityValue) {
    dom.transformOpacity.value = dom.transformOpacityValue.value;
  }
  const transform = {
    x: Number(dom.transformX.value),
    y: Number(dom.transformY.value),
    width: Math.max(1, Number(dom.transformWidth.value) || 1),
    height: Math.max(1, Number(dom.transformHeight.value) || 1),
    rotation: Number(dom.transformRotation.value),
    opacity: Math.max(0, Math.min(1, Number(dom.transformOpacityValue.value) || 0)),
  };
  edit({ op: 'setVisualTransform', itemId: item.id, transform })
    .then(() => selectVisualItem(item.id))
    .catch((error) => reportError(error, 'transform:edit'));
}

function updateSelectedShape() {
  const item = selectedVisualItem();
  if (!item || item.content.kind !== 'shape') return;
  const content = {
    kind: 'shape',
    shape: dom.shapeKind.value,
    fill: preserveAlpha(dom.shapeFill.value, item.content.fill),
    stroke: preserveAlpha(dom.shapeStroke.value, item.content.stroke),
    strokeWidth: Math.max(0, Number(dom.shapeStrokeWidth.value) || 0),
    cornerRadius: Math.max(0, Number(dom.shapeCornerRadius.value) || 0),
    startArrow: dom.shapeStartArrow.checked,
    endArrow: dom.shapeEndArrow.checked,
  };
  edit({ op: 'setVisualContent', itemId: item.id, content })
    .then(() => selectVisualItem(item.id))
    .catch((error) => reportError(error, 'shape:edit'));
}

function updateSelectedSubtitle() {
  const item = selectedVisualItem();
  if (!item || item.content.kind !== 'text') return;
  const start = Math.max(0, Math.round(Number(dom.subtitleStart.value) || 0));
  const end = Math.max(start + 1, Math.round(Number(dom.subtitleEnd.value) || start + 1));
  edit(
    { op: 'setVisualContent', itemId: item.id, content: { ...item.content, text: dom.subtitleValue.value } },
    { op: 'setVisualTiming', itemId: item.id, start, duration: end - start },
  ).catch((error) => reportError(error, 'subtitle:edit'));
}

function updateSubtitleStyle() {
  const item = selectedVisualItem();
  const track = item && state.project.tracks.find((candidate) => (candidate.visualItems || []).some((entry) => entry.id === item.id));
  if (!track || track.kind !== 'subtitle') return;
  const style = {
    ...(track.subtitleStyle || {}),
    fontFamily: dom.subtitleFont.value || 'sans-serif',
    fontSize: Math.max(8, Number(dom.subtitleSize.value) || 64),
    color: dom.subtitleColor.value,
  };
  edit({ op: 'setSubtitleStyle', trackId: track.id, style }).catch((error) => reportError(error, 'subtitle:style'));
}

function updateSelectedText() {
  const item = selectedVisualItem();
  if (!item || item.content.kind !== 'text') return;
  const style = {
    ...(item.content.style || {}),
    fontFamily: dom.textFont.value || 'sans-serif',
    fontSize: Math.max(8, Number(dom.textSize.value) || 64),
    color: dom.textColor.value,
    align: dom.textAlign.value,
    strokeColor: Number(dom.textStrokeWidth.value) > 0 ? dom.textStrokeColor.value : '',
    strokeWidth: Math.max(0, Number(dom.textStrokeWidth.value) || 0),
    shadowColor: preserveAlpha(dom.textShadowColor.value, item.content.style && item.content.style.shadowColor),
  };
  Promise.resolve(window.api.fontAvailable(style.fontFamily))
    .then((available) => {
      if (!available) {
        return window.api.message(
          `"${style.fontFamily}" is not installed. A sans-serif fallback will be used.`,
          { title: 'Font unavailable', kind: 'warning' },
        );
      }
    })
    .then(() => edit({
      op: 'setVisualContent',
      itemId: item.id,
      content: { kind: 'text', text: dom.textValue.value, style },
    }))
    .then(() => selectVisualItem(item.id))
    .catch((error) => reportError(error, 'text:edit'));
}

async function removeSelectedVisualItem() {
  const item = selectedVisualItem();
  if (!item) return;
  const done = await edit({ op: 'removeVisualItem', itemId: item.id });
  if (done) selectVisualItem(null);
}

/** Resolve both halves of a linked timeline selection for the Inspector tabs. */
function selectedClipTargets() {
  const clipId = liveSelection();
  return clipId ? I.clipTargets(state.project, clipId) : null;
}

function updateSelectedVideoOpacity() {
  const targets = selectedClipTargets();
  if (!targets || !targets.video) return;
  edit({
    op: 'setClipGain',
    clipId: targets.video.clip.id,
    opacity: Math.max(0, Math.min(1, Number(dom.clipOpacity.value) || 0)),
  }).catch((error) => reportError(error, 'clip:opacity'));
}

function updateSelectedAudioVolume() {
  const targets = selectedClipTargets();
  if (!targets || !targets.audio) return;
  edit({
    op: 'setClipGain',
    clipId: targets.audio.clip.id,
    volume: Math.max(0, Math.min(1, Number(dom.clipVolume.value) || 0)),
  }).catch((error) => reportError(error, 'clip:volume'));
}

function activateInspectorTab(tab) {
  state.inspectorTab = tab;
  activateSelectedPanel('inspector');
  renderInspector();
}

function moveInspectorTab(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  const nextName = P.adjacentTab(event.currentTarget.dataset.inspectorTab, offset);
  const next = dom.panelTabBar.querySelector(`[data-inspector-tab="${nextName}"]`);
  activateInspectorTab(nextName);
  next.focus();
  event.preventDefault();
}

/** Delete, or delete and close the gap behind it. Ripple is destructive in a
 *  way the timeline used to avoid on purpose, because until now there was no
 *  way back from it. */
async function deleteSelected(ripple) {
  // Selections are exclusive, so a selected layer is the thing the user is
  // looking at; a gap cannot ripple behind one, so both buttons remove it.
  if (selectedVisualItem()) return removeSelectedVisualItem();
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
 *  happen is an unhandled rejection: the toggle is put back and the reason is
 *  shown, so a setting that did not persist does not silently look as though it
 *  did. `bootstrap` is the source of truth on the next launch either way.
 */
async function persistSettings(revert) {
  try {
    state.boot = await window.api.saveSettings(state.settings);
    state.settings = state.boot.settings;
  } catch (error) {
    reportError(error, 'settings:persist');
    if (revert) revert();
    await window.api.message(`That setting could not be saved.\n\n${error}`, {
      title: 'Settings',
      kind: 'error',
    });
  }
}

function toggleSnap() {
  const previous = state.settings.snap;
  state.settings.snap = !previous;
  dom.btnMagnet.classList.toggle('on', state.settings.snap);
  persistSettings(() => {
    state.settings.snap = previous;
    dom.btnMagnet.classList.toggle('on', previous);
  });
}

// --- dragging clips --------------------------------------------------------

let drag = null;

function beginClipDrag(event, node) {
  const clipId = node.dataset.clipId;
  const found = L.findClip(state.project, clipId);
  if (!found) return;
  const box = node.getBoundingClientRect();
  const offsetX = event.clientX - box.left;
  const mode =
    offsetX <= HANDLE_PX ? 'trim-start' : offsetX >= box.width - HANDLE_PX ? 'trim-end' : 'move';

  selectClip(clipId);
  drag = {
    mode,
    clipId,
    node,
    grabFrames: L.pxToFrames(offsetX, rate(), state.pxPerSecond),
    startFrame: found.clip.start,
    endFrame: L.clipEnd(found.clip),
    durationFrames: L.clipDuration(found.clip),
    trackId: found.track.id,
    targetTrackId: found.track.id,
    nextStart: found.clip.start,
    nextEdge: found.clip.start,
    moved: false,
  };
  document.body.classList.add(mode === 'move' ? 'dragging' : 'trimming');
  event.preventDefault();
}

function updateClipDrag(event) {
  const pointer = frameAtClientX(event.clientX);
  const tolerance = snapTolerance();

  if (drag.mode === 'move') {
    const wanted = Math.max(0, pointer - drag.grabFrames);
    drag.nextStart = L.snapClipStart(state.project, wanted, drag.durationFrames, tolerance, {
      exceptClipId: drag.clipId,
      extra: [preview.position()],
    });
    drag.node.style.left = `${L.framesToPx(drag.nextStart, rate(), state.pxPerSecond)}px`;

    // The lane under the pointer decides the target track, but only if it can
    // play this asset; otherwise the clip stays where it came from.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const lane = under && under.closest ? under.closest('.lane') : null;
    const found = L.findClip(state.project, drag.clipId);
    const asset = found && L.findAsset(state.project, found.clip.assetId);
    const track = lane && L.findTrack(state.project, lane.dataset.trackId);
    for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
    if (track && L.canAccept(track, asset)) {
      drag.targetTrackId = track.id;
      lane.classList.add('drop-target');
      if (drag.node.parentElement !== lane) lane.appendChild(drag.node);
    }
  } else {
    const snapped = L.snapTime(state.project, pointer, tolerance, {
      exceptClipId: drag.clipId,
      extra: [preview.position()],
    });
    const shortest = L.minClipFrames(rate());
    drag.nextEdge = snapped;
    if (drag.mode === 'trim-start') {
      const at = Math.min(snapped, drag.endFrame - shortest);
      drag.node.style.left = `${L.framesToPx(Math.max(0, at), rate(), state.pxPerSecond)}px`;
      drag.node.style.width = `${Math.max(2, L.framesToPx(drag.endFrame - at, rate(), state.pxPerSecond))}px`;
    } else {
      const at = Math.max(snapped, drag.startFrame + shortest);
      drag.node.style.width = `${Math.max(2, L.framesToPx(at - drag.startFrame, rate(), state.pxPerSecond))}px`;
    }
  }
  drag.moved = true;
}

/** The pointer came up, so the drag becomes a command. This is the only moment
 *  in a drag that Rust hears about, which is what keeps a mouse move off the
 *  IPC boundary. Rust may put the clip somewhere other than where it is being
 *  drawn — pushed right past a clip it would have overlapped — and the redraw
 *  is what settles it. */
function endClipDrag() {
  const current = drag;
  drag = null;
  document.body.classList.remove('dragging', 'trimming');
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  if (!current) return;
  if (!current.moved) {
    renderTimeline();
    return;
  }
  return edit(
    current.mode === 'move'
      ? {
          op: 'moveClip',
          clipId: current.clipId,
          trackId: current.targetTrackId,
          start: current.nextStart,
        }
      : {
          op: 'trimClip',
          clipId: current.clipId,
          edge: current.mode === 'trim-start' ? 'start' : 'end',
          frame: current.nextEdge,
        }
  );
}

// --- dragging text and shape layers on the timeline -------------------------

let visualTimingDrag = null;

function beginVisualItemDrag(event, node) {
  if (event.button !== 0) return;
  const found = L.findVisualItem(state.project, node.dataset.visualItemId);
  if (!found) return;
  selectVisualItem(found.item.id);
  const box = node.getBoundingClientRect();
  const offsetX = event.clientX - box.left;
  const mode =
    offsetX <= HANDLE_PX ? 'trim-start' : offsetX >= box.width - HANDLE_PX ? 'trim-end' : 'move';
  visualTimingDrag = {
    mode,
    itemId: found.item.id,
    node,
    grabFrames: L.pxToFrames(offsetX, rate(), state.pxPerSecond),
    nextStart: found.item.start,
    nextEnd: found.item.start + found.item.duration,
    moved: false,
  };
  document.body.classList.add(mode === 'move' ? 'dragging' : 'trimming');
  event.preventDefault();
}

function updateVisualItemDrag(event) {
  const current = visualTimingDrag;
  const pointer = frameAtClientX(event.clientX);
  const tolerance = snapTolerance();
  const duration = current.nextEnd - current.nextStart;
  if (current.mode === 'move') {
    const wanted = Math.max(0, pointer - current.grabFrames);
    current.nextStart = L.snapClipStart(state.project, wanted, duration, tolerance, {
      extra: [preview.position()],
    });
    current.nextEnd = current.nextStart + duration;
    current.node.style.left = `${L.framesToPx(current.nextStart, rate(), state.pxPerSecond)}px`;
  } else {
    const snapped = L.snapTime(state.project, pointer, tolerance, { extra: [preview.position()] });
    if (current.mode === 'trim-start') {
      current.nextStart = Math.max(0, Math.min(snapped, current.nextEnd - 1));
      current.node.style.left = `${L.framesToPx(current.nextStart, rate(), state.pxPerSecond)}px`;
    } else {
      current.nextEnd = Math.max(current.nextStart + 1, snapped);
    }
    const width = L.framesToPx(current.nextEnd - current.nextStart, rate(), state.pxPerSecond);
    current.node.style.width = `${Math.max(2, width)}px`;
  }
  current.moved = true;
}

function endVisualItemDrag() {
  const current = visualTimingDrag;
  visualTimingDrag = null;
  document.body.classList.remove('dragging', 'trimming');
  if (!current) return;
  if (!current.moved) {
    renderTimeline();
    return;
  }
  return edit({
    op: 'setVisualTiming',
    itemId: current.itemId,
    start: current.nextStart,
    duration: current.nextEnd - current.nextStart,
  });
}

// --- dragging the toolbar's Text and Shape buttons onto a track --------------

let toolDrag = null;
/** Set for the moment between a dragged release and the click the browser
 *  sends after it. Read and reset by the buttons' own click handlers. */
let toolDragJustEnded = false;

function tookToolDragClick() {
  const dragged = toolDragJustEnded;
  toolDragJustEnded = false;
  return dragged;
}

/** The + Text and + Shape buttons drag like assets do: pointer events, a
 *  ghost, and a lane that lights up. A plain click never grows a ghost, ends
 *  here doing nothing, and the button's own click handler adds the layer at
 *  the playhead as before. */
function beginToolDrag(event, kind) {
  if (event.button !== 0) return;
  toolDrag = { kind, startX: event.clientX, startY: event.clientY, ghost: null, dragged: false };
}

/** Put the page back and report the drag, if it had got as far as a ghost.
 *
 *  Every way a drag can end comes through here — the pointer coming up, the
 *  sequence being cancelled, the window losing focus mid-drag — so a ghost is
 *  never left stuck to a cursor with no button held. Without it the next
 *  release over a lane would add a layer nobody asked for. */
function clearToolDrag() {
  const current = toolDrag;
  toolDrag = null;
  if (!current || !current.ghost) return null;
  current.ghost.remove();
  document.body.classList.remove('dragging');
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  return current;
}

function updateToolDrag(event) {
  if (!toolDrag.ghost) {
    const travelled =
      Math.abs(event.clientX - toolDrag.startX) + Math.abs(event.clientY - toolDrag.startY);
    if (travelled < 4) return;
    toolDrag.ghost = document.createElement('div');
    toolDrag.ghost.className = 'drag-ghost';
    toolDrag.ghost.textContent = toolDrag.kind === 'text' ? 'Text' : 'Shape';
    document.body.appendChild(toolDrag.ghost);
    document.body.classList.add('dragging');
  }
  toolDrag.ghost.style.left = `${event.clientX + 12}px`;
  toolDrag.ghost.style.top = `${event.clientY + 12}px`;
  const lane = laneAtPoint(event.clientX, event.clientY);
  const track = lane && L.findTrack(state.project, lane.dataset.trackId);
  const accepts = Boolean(track && track.kind === 'video');
  for (const node of dom.lanes.querySelectorAll('.lane')) {
    node.classList.toggle('drop-target', node === lane && accepts);
  }
}

async function endToolDrag(event) {
  const current = clearToolDrag();
  if (!current) return;
  // A drag that grew a ghost is never also a click, even when it ends back on
  // the button — the browser fires one anyway, and without this the cancelled
  // drag would add a layer at the playhead.
  toolDragJustEnded = true;
  const lane = laneAtPoint(event.clientX, event.clientY);
  const track = lane && L.findTrack(state.project, lane.dataset.trackId);
  if (!track || track.kind !== 'video') return;
  const frame = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
  const add = current.kind === 'text' ? addText : addShape;
  await add({ trackId: track.id, frame });
}

// --- scrubbing -------------------------------------------------------------

let scrubbing = false;

function scrubTo(clientX) {
  const tolerance = snapTolerance();
  preview.seek(L.snapTime(state.project, frameAtClientX(clientX), tolerance));
}

function beginScrub(event) {
  if (event.target.closest('[data-marker-id]')) return;
  scrubbing = true;
  preview.setScrubbing(true);
  scrubTo(event.clientX);
  event.preventDefault();
}

// --- dropping --------------------------------------------------------------

/** One addClip per asset, all asking for the same frame.
 *
 *  They come out end to end rather than on top of each other because a clip
 *  never overlaps another one: the second lands after the first, the third
 *  after the second. The page does not have to work out where any of them go,
 *  which is exactly the arithmetic it no longer owns. */
function dropCommands(trackId, assets, atFrame) {
  const track = L.findTrack(state.project, trackId);
  if (!track) return [];
  const commands = [];
  const accepted = assets.filter((asset) => L.canAccept(track, asset));
  if (track.kind === 'video') {
    const firstVideo = accepted.find((asset) => asset.kind === 'video');
    const settings = L.settingsForFirstVideo(state.project, firstVideo, {
      width: state.settings.defaultWidth,
      height: state.settings.defaultHeight,
    });
    if (settings) commands.push({ op: 'setSettings', settings });
  }
  for (const asset of accepted) {
    if (track.kind === 'video' && asset.kind === 'video' && asset.hasAudio) {
      const videoIndex = L.tracksOf(state.project, 'video').findIndex((item) => item.id === trackId);
      const audio = L.tracksOf(state.project, 'audio')[videoIndex];
      if (!audio) return null;
      const linkGroup = `g${crypto.randomUUID()}`;
      commands.push(
        { op: 'addClip', trackId, assetId: asset.id, start: atFrame, linkGroup },
        { op: 'addClip', trackId: audio.id, assetId: asset.id, start: atFrame, linkGroup }
      );
      continue;
    }
    commands.push({ op: 'addClip', trackId, assetId: asset.id, start: atFrame });
  }
  return commands;
}

function laneAtPoint(x, y) {
  const under = document.elementFromPoint(x, y);
  if (!under || !under.closest) return null;
  return under.closest('.lane');
}

function sourcePanelAtPoint(x, y) {
  const under = document.elementFromPoint(x, y);
  if (!under || !under.closest) return null;
  return under.closest('#source-panel');
}

function selectMadeOnTrack(made, trackId) {
  if (!made || !made.length) return;
  const selected = made.find((clipId) => {
    const found = L.findClip(state.project, clipId);
    return found && found.track.id === trackId;
  });
  selectClip(selected || made[0]);
}

/** Dragging an asset out of the panel and onto a lane runs on pointer events
 *  rather than HTML5 drag and drop.
 *
 *  The webview that shows this page is also the view that catches files dropped
 *  from Finder, and that handler reports every drag event as handled — including
 *  a drag that started inside the page and carries no file at all. WebKit never
 *  gets it, so `dragover` and `drop` do not fire and a `draggable` asset lands
 *  nowhere. Pointer events are not routed through it. */
let assetDrag = null;

function beginAssetDrag(event) {
  if (event.button !== 0) return;
  const item = event.target.closest('.asset');
  if (!item || event.target.closest('[data-remove]')) return;
  const asset = L.findAsset(state.project, item.dataset.id);
  if (!asset) return;
  assetDrag = { asset, startX: event.clientX, startY: event.clientY, ghost: null };
}

function updateAssetDrag(event) {
  // A few pixels of slack, so a click that wobbles still reads as a click.
  if (!assetDrag.ghost) {
    const travelled =
      Math.abs(event.clientX - assetDrag.startX) + Math.abs(event.clientY - assetDrag.startY);
    if (travelled < 4) return;
    assetDrag.ghost = document.createElement('div');
    assetDrag.ghost.className = 'drag-ghost';
    assetDrag.ghost.textContent = assetDrag.asset.name || baseName(assetDrag.asset.path);
    document.body.appendChild(assetDrag.ghost);
    document.body.classList.add('dragging');
  }
  assetDrag.ghost.style.left = `${event.clientX + 12}px`;
  assetDrag.ghost.style.top = `${event.clientY + 12}px`;
  const lane = laneAtPoint(event.clientX, event.clientY);
  const sourcePanel = sourcePanelAtPoint(event.clientX, event.clientY);
  for (const node of dom.lanes.querySelectorAll('.lane')) {
    node.classList.toggle('drop-target', node === lane);
  }
  dom.sourcePanel.classList.toggle('drop-target', Boolean(sourcePanel) && !lane);
}

/** Put the page back the way it was and report the drag that was running, if it
 *  had got as far as showing a ghost.
 *
 *  A drag does not always end in a pointerup: the pointer sequence can be
 *  cancelled, or the window can lose focus mid-drag and the button come up
 *  somewhere else entirely. Every one of those paths comes through here, so a
 *  ghost is never left stuck to the cursor. */
function clearAssetDrag() {
  const current = assetDrag;
  assetDrag = null;
  if (!current || !current.ghost) return null;
  current.ghost.remove();
  document.body.classList.remove('dragging');
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  dom.sourcePanel.classList.remove('drop-target');
  return current;
}

async function endAssetDrag(event) {
  const current = clearAssetDrag();
  if (!current) return;

  const lane = laneAtPoint(event.clientX, event.clientY);
  if (sourcePanelAtPoint(event.clientX, event.clientY)) {
    selectAsset(current.asset.id);
    return;
  }
  if (!lane) return;
  const at = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
  const commands = dropCommands(lane.dataset.trackId, [current.asset], at);
  if (!commands) {
    await window.api.message('Add the matching audio track before placing this video.', {
      title: 'Linked clip needs an audio track',
    });
    return;
  }
  const made = await edit(...commands);
  selectMadeOnTrack(made, lane.dataset.trackId);
}

async function handleOsDrop(payload) {
  if (payload.type === 'over') {
    const point = payload.position || { x: 0, y: 0 };
    const ratio = window.devicePixelRatio || 1;
    const lane = laneAtPoint(point.x / ratio, point.y / ratio);
    const sourcePanel = sourcePanelAtPoint(point.x / ratio, point.y / ratio);
    for (const node of dom.lanes.querySelectorAll('.lane')) {
      node.classList.toggle('drop-target', node === lane);
    }
    dom.sourcePanel.classList.toggle('drop-target', Boolean(sourcePanel) && !lane);
    dom.assetsPanel.classList.toggle('drop-target', !lane && !sourcePanel);
    return;
  }
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  dom.assetsPanel.classList.remove('drop-target');
  dom.sourcePanel.classList.remove('drop-target');
  if (payload.type !== 'drop') return;

  // The event carries physical pixels; elementFromPoint wants CSS pixels.
  const point = payload.position || { x: 0, y: 0 };
  const ratio = window.devicePixelRatio || 1;
  const x = point.x / ratio;
  const y = point.y / ratio;
  const lane = laneAtPoint(x, y);
  const sourcePanel = sourcePanelAtPoint(x, y);

  const found = await probePaths(payload.paths || []);
  if (!found.length) return;
  // The import and the clips it turns into are one thing the user did, so they
  // go over as one transaction and come back on one press of undo.
  const at = L.snapTime(state.project, frameAtClientX(x), snapTolerance());
  const commands = lane ? dropCommands(lane.dataset.trackId, found, at) : [];
  if (lane && !commands) {
    await window.api.message('Add the matching audio track before placing this video.', {
      title: 'Linked clip needs an audio track',
    });
    return;
  }
  const made = await edit(
    { op: 'addAssets', assets: found },
    ...commands
  );
  if (sourcePanel) selectAsset(found[0].id);
  else if (lane) selectMadeOnTrack(made, lane.dataset.trackId);
  for (const asset of found) hydrateDuration(asset);
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

/** Whether the setting says to stay off the graphics device.
 *
 *  Mirrors `stays_on_cpu` in Rust, and for the same reason: this one answer
 *  decides the exact frame, the playback engine and the render, and asking the
 *  question three different ways is how those three drift apart. Only "cpu" is
 *  cpu — a settings file written before this was two choices can still hold
 *  "auto" or "ffmpeg", and both of those meant the graphics device. */
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
    return 'Nothing opens the graphics device. Playback is stacked <video> elements, the exact frame is not asked for, and the render is drawn by the ffmpeg filter graph. ffmpeg is still what decodes and encodes either way.';
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
  // The sheet's own pending choice, not the saved one. Picking CPU should grey
  // this out at once rather than after Apply.
  const onCpu = el('as-compositor').value === 'cpu';
  select.disabled = onCpu;
  const drawing = (state.boot && state.boot.compositor && state.boot.compositor.device) || 'nothing yet';
  if (!devices.length) {
    note.textContent = 'No graphics device was found, so there is nothing to choose between.';
    return;
  }
  note.textContent = onCpu
    ? 'The CPU setting never opens a graphics device, so this is not used.'
    : `Drawing on ${drawing}. Changing this restarts the monitor.`;
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

function shortcutMap() {
  return K.resolved(state.settings.shortcutOverrides);
}

function renderShortcutLabels() {
  const byAction = new Map(shortcutMap().map((shortcut) => [shortcut.action, shortcut]));
  for (const node of document.querySelectorAll('[data-shortcut]')) {
    const shortcut = byAction.get(node.dataset.shortcut);
    node.textContent = shortcut ? K.formatKeys(shortcut.keys) : '';
  }
}

function fillShortcutSheet() {
  const list = el('shortcut-list');
  list.textContent = '';
  for (const shortcut of shortcutMap()) {
    const row = document.createElement('label');
    row.className = 'shortcut-row';
    row.textContent = shortcut.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.shortcutAction = shortcut.action;
    input.value = K.inputKeys(shortcut.keys);
    input.setAttribute('aria-label', `${shortcut.label} shortcut`);
    row.appendChild(input);
    list.appendChild(row);
  }
  const error = el('shortcut-error');
  error.hidden = true;
  error.textContent = '';
}

function collectShortcutOverrides() {
  const keysByAction = {};
  for (const input of el('shortcut-list').querySelectorAll('[data-shortcut-action]')) {
    const keys = K.parseKeys(input.value);
    if (!keys) throw new Error(`Use a key such as Cmd+S for ${input.previousSibling.textContent}.`);
    keysByAction[input.dataset.shortcutAction] = keys;
  }
  const updated = K.resolved(K.overridesFor(keysByAction));
  const conflicts = K.conflicts(updated);
  if (conflicts.length) {
    const conflict = conflicts[0];
    throw new Error(`${K.formatKeys([conflict.key])} is used by ${conflict.first.label} and ${conflict.second.label}.`);
  }
  return K.overridesFor(keysByAction);
}

function applySettings(next) {
  const wasCompositor = state.settings.compositor;
  const wasDevice = state.settings.gpuDevice;
  const wasPreviewQuality = state.settings.previewQuality;
  const usedProxies = state.settings.proxyEnabled;
  const usedGuides = G.visible(state.settings);
  state.settings = next;
  renderShortcutLabels();
  preview.setQuality(next.previewQuality);
  preview.setMuteWhileScrubbing(next.previewMuteWhileScrubbing);
  dom.previewQuality.value = next.previewQuality;
  dom.btnMagnet.classList.toggle('on', next.snap);
  syncEditorOverlay();
  renderStageOverlay();
  // A session captures its compositor and its engine when it starts, so both of
  // the things this setting decides need the running one taken down and asked
  // for again rather than hoping the next command notices.
  //
  // This is also what attaches the first time. The page's own compositor value
  // is not one the setting can hold, so bootstrap landing *is* a change and
  // lands here — which is why there is no separate attach after it.
  let monitorUpdate = null;
  if (
    wasCompositor !== next.compositor ||
    wasDevice !== next.gpuDevice ||
    wasPreviewQuality !== next.previewQuality
  ) {
    monitorUpdate = attachMonitor(true);
  } else if (usedGuides !== G.visible(next)) {
    monitorUpdate = attachMonitor(true);
  } else if (usedProxies !== next.proxyEnabled) {
    if (preview.usesNativeMonitor()) monitorUpdate = attachMonitor(true);
    else preview.redraw();
  }
  return monitorUpdate || Promise.resolve();
}

/** Ask Rust for a monitor, or give the one that is running a new box.
 *
 *  Called when a project opens, when the playback setting changes and when the
 *  window settles after a layout. `restart` takes down whatever is there first,
 *  which is what a settings change needs and a resize must not do. */
async function attachMonitor(restart) {
  if (!preview) return;
  if (restart) {
    state.playbackNotice = null;
    await preview.release();
  }
  await preview.attach();
  updateToolWarning();
  updateMonitorZoomUi();
  // Which engine is running decides who draws the text and shape layers, and
  // the answer only arrives here. Switching to the media elements has to put
  // the page's own copy back on the stage; switching away has to take it off.
  drawStageVisuals();
  scheduleExactFrame();
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
    fillShortcutSheet();
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
  for (const button of dom.panelTabBar.querySelectorAll('[data-inspector-tab]')) {
    button.addEventListener('click', () => activateInspectorTab(button.dataset.inspectorTab));
    button.addEventListener('keydown', moveInspectorTab);
  }
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
  dom.assetList.addEventListener('pointerdown', beginAssetDrag);
  window.addEventListener('pointermove', (event) => {
    if (assetDrag) updateAssetDrag(event);
  });
  window.addEventListener('pointerup', endAssetDrag);
  window.addEventListener('pointercancel', () => {
    clearAssetDrag();
    clearToolDrag();
  });
  window.addEventListener('blur', () => {
    clearAssetDrag();
    clearToolDrag();
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
    if (!tookToolDragClick()) addText();
  });
  dom.btnAddShape.addEventListener('click', () => {
    if (!tookToolDragClick()) addShape();
  });
  dom.btnAddText.addEventListener('pointerdown', (event) => beginToolDrag(event, 'text'));
  dom.btnAddShape.addEventListener('pointerdown', (event) => beginToolDrag(event, 'shape'));
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

  dom.ruler.addEventListener('pointerdown', beginScrub);
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
  for (const input of [
    dom.textValue, dom.textFont, dom.textSize, dom.textColor, dom.textAlign,
    dom.textStrokeColor, dom.textStrokeWidth, dom.textShadowColor,
  ]) {
    input.addEventListener('change', updateSelectedText);
  }
  for (const input of [
    dom.shapeKind, dom.shapeFill, dom.shapeStroke, dom.shapeStrokeWidth,
    dom.shapeCornerRadius, dom.shapeStartArrow, dom.shapeEndArrow,
  ]) {
    input.addEventListener('change', updateSelectedShape);
  }
  for (const input of [dom.subtitleValue, dom.subtitleStart, dom.subtitleEnd]) {
    input.addEventListener('change', updateSelectedSubtitle);
  }
  for (const input of [dom.subtitleFont, dom.subtitleSize, dom.subtitleColor]) {
    input.addEventListener('change', updateSubtitleStyle);
  }
  dom.clipOpacity.addEventListener('change', updateSelectedVideoOpacity);
  dom.clipVolume.addEventListener('change', updateSelectedAudioVolume);
  for (const input of [
    dom.transformX, dom.transformY, dom.transformWidth, dom.transformHeight,
    dom.transformRotation, dom.transformOpacity, dom.transformOpacityValue,
  ]) {
    input.addEventListener('change', updateSelectedTransform);
  }
  dom.lanes.addEventListener('pointerdown', (event) => {
    const visual = event.target.closest('[data-visual-item-id]');
    if (visual) {
      beginVisualItemDrag(event, visual);
      return;
    }
    const clip = event.target.closest('.clip');
    if (clip) {
      beginClipDrag(event, clip);
      return;
    }
    selectClip(null);
    selectVisualItem(null);
    beginScrub(event);
  });
  dom.lanes.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const visual = event.target.closest('[data-visual-item-id]');
    if (visual) {
      selectVisualItem(visual.dataset.visualItemId);
      openTimelineContextMenu(event, [
        { label: 'Delete Layer', run: () => removeSelectedVisualItem() },
      ]);
      return;
    }
    const clip = event.target.closest('.clip');
    if (clip) {
      selectClip(clip.dataset.clipId);
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
    selectClip(null);
    openTimelineContextMenu(event, [
      {
        label: 'Ripple Delete Gap',
        run: () => edit({ op: 'rippleDeleteGap', trackId: track.id, start: gap.start, end: gap.end }),
      },
    ]);
  });

  window.addEventListener('pointermove', (event) => {
    if (drag) updateClipDrag(event);
    else if (visualTimingDrag) updateVisualItemDrag(event);
    else if (toolDrag) updateToolDrag(event);
    else if (scrubbing) scrubTo(event.clientX);
  });
  window.addEventListener('pointerup', (event) => {
    if (drag) endClipDrag();
    if (visualTimingDrag) endVisualItemDrag();
    if (toolDrag) {
      endToolDrag(event).catch((error) => reportError(error, 'tool-drop'));
    }
    if (scrubbing) {
      scrubbing = false;
      preview.setScrubbing(false);
    }
  });
}

function wireTransport() {
  let monitorPan = null;
  dom.btnPlay.addEventListener('click', () => preview.toggle());
  dom.previewQuality.addEventListener('change', () => {
    const previous = state.settings.previewQuality;
    state.settings.previewQuality = dom.previewQuality.value;
    preview.setQuality(state.settings.previewQuality);
    void persistSettings(() => {
      state.settings.previewQuality = previous;
      dom.previewQuality.value = previous;
      preview.setQuality(previous);
    }).then(() => {
      if (preview.usesNativeMonitor()) return attachMonitor(true);
    });
  });
  dom.stage.addEventListener('wheel', (event) => {
    if (!event.metaKey) return;
    const box = dom.stage.getBoundingClientRect();
    const cursor = { x: event.clientX - box.left, y: event.clientY - box.top };
    const changed = event.deltaY < 0 ? preview.zoomIn(cursor) : preview.zoomOut(cursor);
    if (changed) {
      event.preventDefault();
      updateMonitorZoomUi();
    }
  }, { passive: false });
  dom.stage.addEventListener('pointerdown', (event) => {
    if (beginVisualDrag(event)) return;
    const zoom = preview.zoomState();
    if (event.button !== 0 || !zoom.available || zoom.zoom <= 1) return;
    monitorPan = { x: event.clientX, y: event.clientY };
    dom.stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dom.stage.addEventListener('pointermove', (event) => {
    if (visualDrag) {
      updateVisualDrag(event);
      return;
    }
    if (!monitorPan) return;
    preview.panBy(event.clientX - monitorPan.x, event.clientY - monitorPan.y);
    monitorPan = { x: event.clientX, y: event.clientY };
  });
  dom.stage.addEventListener('pointerup', (event) => {
    if (visualDrag) {
      endVisualDrag(event).catch((error) => reportError(error, 'visual-item:transform'));
      return;
    }
    if (!monitorPan) return;
    monitorPan = null;
    dom.stage.releasePointerCapture(event.pointerId);
  });
  dom.stage.addEventListener('pointercancel', () => {
    cancelVisualDrag();
    monitorPan = null;
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
    try {
      state.boot = await window.api.saveSettings(next);
    } catch (error) {
      reportError(error, 'settings:save');
      await window.api.message(`Those settings could not be saved.\n\n${error}`, {
        title: 'Settings',
        kind: 'error',
      });
      return;
    }
    applySettings(state.boot.settings);
    updateToolWarning();
  });
  el('shortcut-save').addEventListener('click', async () => {
    const error = el('shortcut-error');
    let shortcutOverrides;
    try {
      shortcutOverrides = collectShortcutOverrides();
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
      return;
    }
    try {
      state.boot = await window.api.saveSettings(Object.assign({}, state.settings, { shortcutOverrides }));
    } catch (cause) {
      reportError(cause, 'settings:shortcuts');
      error.textContent = `Those shortcuts could not be saved. ${cause}`;
      error.hidden = false;
      return;
    }
    closeSheet('shortcut-settings');
    applySettings(state.boot.settings);
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
    try {
      state.boot = await window.api.saveSettings(next);
    } catch (error) {
      reportError(error, 'settings:proxy');
      await window.api.message(`The proxy setting could not be saved.\n\n${error}`, {
        title: 'Proxy Media',
        kind: 'error',
      });
      return;
    }
    applySettings(state.boot.settings);
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

function wireKeyboard() {
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
    if (typing) return;
    if (event.key === 'Escape') {
      closeMenus();
      closeTimelineContextMenu();
      for (const sheet of document.querySelectorAll('.overlay')) {
        if (sheet.id !== 'render-overlay' || !state.rendering) sheet.hidden = true;
      }
      return;
    }
    const action = K.actionFor(event, shortcutMap());
    if (!action) return;
    event.preventDefault();
    const run = actions[action];
    if (run) Promise.resolve().then(run).catch((error) => reportError(error, `shortcut:${action}`));
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

async function boot() {
  state.pxPerSecond = zoomToPxPerSecond(dom.zoom.value);

  sourcePreview = globalThis.previewLib.createPreview({
    stage: dom.sourceStage,
    inner: dom.sourceStageInner,
    wrap: dom.sourceStageWrap,
    getProject: () => state.project,
    playbackPath,
    onTick: (frame, playing) => {
      dom.sourceClock.textContent = sourceTime(frame);
      dom.sourceSeek.value = String(Math.round(frame));
      dom.sourcePlay.textContent = playing ? '❚❚' : '▶';
    },
  });

  qualityMonitor = globalThis.qualityLib.createQualityMonitor({});
  mediaPreview = globalThis.previewLib.createPreview({
    stage: dom.stage,
    inner: dom.stageInner,
    exactCanvas: dom.stageExact,
    wrap: dom.stageWrap,
    getProject: () => state.project,
    playbackPath,
    qualityMonitor,
    onTick: (frame, playing) => {
      updatePlayhead(frame);
      followPlayhead(frame);
      dom.btnPlay.textContent = playing ? '❚❚' : '▶';
      if (playing) {
        // Playing is the stacked elements; the composited frame cannot keep up
        // and would only freeze one moment over moving video.
        preview.clearExact();
        setStageMode('live');
      } else {
        scheduleExactFrame();
      }
    },
  });

  // Everything below still says `preview`, and on the media element engine that
  // is exactly what it is. On the native one the router forwards the transport
  // to Rust instead and leaves the rest — the asset preview, the quality
  // setting, the element pool — where it was.
  preview = globalThis.monitorLib.createMonitor({
    preview: mediaPreview,
    stage: dom.stage,
    // The panel is what the native place is computed from, so the view and the
    // page's own stage come out of one calculation rather than two.
    wrap: dom.stageWrap,
    api: window.api,
    getProject: () => state.project,
    pageOverlayActive: () => G.visible(state.settings),
    onNotice: (reason) => {
      state.playbackNotice = reason;
      updateToolWarning();
    },
    onTick: (frame, playing) => {
      updatePlayhead(frame);
      followPlayhead(frame);
      dom.btnPlay.textContent = playing ? '❚❚' : '▶';
      // Nothing to schedule and nothing to badge: the monitor draws the frame
      // under a stopped playhead with the same compositor it plays with.
      setStageMode(null);
    },
  });

  if (typeof ResizeObserver === 'function') {
    stageResizeObserver = new ResizeObserver(() => {
      renderStageOverlay();
      drawStageVisuals();
      preview.place();
    });
    stageResizeObserver.observe(dom.stage);
  }

  await applySettings(state.settings);
  globalThis.makevideoQuality = globalThis.qualityLib.createQualityHarness({
    monitor: qualityMonitor,
    preview,
    getProject: () => state.project,
    // The harness hides and mutes tracks to measure what each one costs, and
    // that is an edit like any other, so it goes over the same wire.
    setTrackFlags: (trackId, flags) => edit(Object.assign({ op: 'setTrackFlags', trackId }, flags)),
    memoryBytes: window.api.processMemoryBytes,
    saveReport: window.api.saveQualityReport,
  });
  updateToolWarning();

  wireMenus();
  wireSelectedPanel();
  wireAssets();
  wireTimeline();
  wireTransport();
  wireSheets();
  wireKeyboard();

  subscribe('events:render-progress', window.api.onRenderProgress, onRenderProgress);
  subscribe('events:render-done', window.api.onRenderDone, onRenderDone);
  subscribe('events:render-fallback', window.api.onRenderFallback, onRenderFallback);
  subscribe('events:proxy-status', window.api.onProxyStatus, onProxyStatus);
  subscribe('events:waveform-status', window.api.onWaveformStatus, onWaveformStatus);
  subscribe('events:file-drop', window.api.onFileDrop, (payload) => {
    Promise.resolve(handleOsDrop(payload)).catch((error) => reportError(error, 'file-drop'));
  });
  subscribe('events:close-requested', window.api.onCloseRequested, async (event) => {
    if (isDirty()) {
      if (event && event.preventDefault) event.preventDefault();
      if (!(await confirmDiscard('Quit'))) return;
    }
    window.api.closeWindow();
  });
  window.addEventListener('resize', () => {
    renderTimeline();
    // The window moving or resizing moves the stage, and the native view is
    // placed in the window rather than laid out by the page.
    if (preview) preview.place();
  });

  refresh();

  try {
    adopt(await window.api.editState());
    state.savedRevision = state.doc.revision;
    refresh();
  } catch (error) {
    reportError(error, 'edit-state');
  }

  try {
    state.boot = await window.api.bootstrap();
    state.settings = { ...DEFAULT_SETTINGS, ...state.boot.settings };
    await applySettings(state.settings);
    updateToolWarning();
    refresh();
  } catch (error) {
    reportError(error, 'bootstrap');
    dom.toolWarning.hidden = false;
    dom.toolWarning.textContent = 'Initialization failed';
    dom.toolWarning.title = 'Open Settings to inspect the error log location';
  }

  // The system's font families, for the text inspectors' pickers. Off the
  // boot path on purpose: reading every font file's name takes long enough to
  // notice, and nothing before the first font edit needs the list.
  Promise.resolve(window.api.listFonts())
    .then((families) => {
      if (!dom.fontOptions || !Array.isArray(families)) return;
      dom.fontOptions.textContent = '';
      for (const family of families) {
        const option = document.createElement('option');
        option.value = family;
        dom.fontOptions.appendChild(option);
      }
    })
    .catch(() => {});

  if (state.boot.qualityProject && state.boot.qualityReport) {
    window.setTimeout(async () => {
      if (!(await openProjectPath(state.boot.qualityProject))) return;
      const config = state.boot.qualitySmoke ? qualitySmokeConfig() : undefined;
      const report = await globalThis.makevideoQuality.runAll(config);
      await window.api.writeQualityReport(state.boot.qualityReport, report);
      window.api.closeWindow();
    }, 250);
  }
}

// One name, so diagnostics in Web Inspector do not shadow anything else on the page.
globalThis.makevideo = {
  state,
  refresh,
  preview: () => preview,
  lib: L,
};

boot().catch((error) => reportError(error, 'ui-initialization'));
})();
