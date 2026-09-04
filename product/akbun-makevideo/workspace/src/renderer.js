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
  visualBlendMode: el('visual-blend-mode'),
  addTransformKeyframes: el('add-transform-keyframes'),
  clipPanel: el('clip-panel'),
  clipSummary: el('clip-summary'),
  clipVideoPanel: el('clip-video-panel'),
  clipAudioPanel: el('clip-audio-panel'),
  clipOpacity: el('clip-opacity'),
  clipVolume: el('clip-volume'),
  clipBlendMode: el('clip-blend-mode'),
  clipSpeed: el('clip-speed'),
  clipPreservePitch: el('clip-preserve-pitch'),
  clipFadeIn: el('clip-fade-in'),
  clipFadeOut: el('clip-fade-out'),
  addVolumeKeyframe: el('add-volume-keyframe'),
  keyframePanel: el('keyframe-panel'),
  keyframeSummary: el('keyframe-summary'),
  keyframeFrame: el('keyframe-frame'),
  keyframeValue: el('keyframe-value'),
  keyframeEasing: el('keyframe-easing'),
  keyframeUpdate: el('keyframe-update'),
  keyframeDelete: el('keyframe-delete'),
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
  selectedKeyframe: null,
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
  assetUi.setRuntime(runtime);
  timelineUi.setRuntime(runtime);
  projectUi.setRuntime(runtime);
  wiring.setRuntime(runtime);
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

// --- assets ---------------------------------------------------------------

const assetUi = globalThis.rendererAssetsUiLib.createRendererAssetsUi({
  L, T, S, P, state, dom, el, baseName, rate, edit, reportError, errorText,
  renderLanes: (...args) => renderLanes(...args),
  refresh: (...args) => refresh(...args),
});

function assetSummary(...args) { return assetUi.assetSummary(...args); }
function playbackPath(...args) { return assetUi.playbackPath(...args); }
function adoptProxyStatuses(...args) { return assetUi.adoptProxyStatuses(...args); }
function proxySummary(...args) { return assetUi.proxySummary(...args); }
function renderProxySummary(...args) { return assetUi.renderProxySummary(...args); }
function renderProxyProgress(...args) { return assetUi.renderProxyProgress(...args); }
function byteText(...args) { return assetUi.byteText(...args); }
function millisecondsText(...args) { return assetUi.millisecondsText(...args); }
function playbackDebugLines(...args) { return assetUi.playbackDebugLines(...args); }
function clipDragDebugLines(...args) { return assetUi.clipDragDebugLines(...args); }
function refreshDebug(...args) { return assetUi.refreshDebug(...args); }
function startDebug(...args) { return assetUi.startDebug(...args); }
function stopDebug(...args) { return assetUi.stopDebug(...args); }
function activateSelectedPanel(...args) { return assetUi.activateSelectedPanel(...args); }
function toggleSelectedPanel(...args) { return assetUi.toggleSelectedPanel(...args); }
function prepareProxies(...args) { return assetUi.prepareProxies(...args); }
function adoptWaveformStatuses(...args) { return assetUi.adoptWaveformStatuses(...args); }
function prepareWaveforms(...args) { return assetUi.prepareWaveforms(...args); }
function prepareDerivedMedia(...args) { return assetUi.prepareDerivedMedia(...args); }
function onProxyStatus(...args) { return assetUi.onProxyStatus(...args); }
function onWaveformStatus(...args) { return assetUi.onWaveformStatus(...args); }
function renderAssets(...args) { return assetUi.renderAssets(...args); }
function selectedSourceAsset(...args) { return assetUi.selectedSourceAsset(...args); }
function sourceTime(...args) { return assetUi.sourceTime(...args); }
function renderSourceMonitor(...args) { return assetUi.renderSourceMonitor(...args); }
function setSourceMark(...args) { return assetUi.setSourceMark(...args); }
function sourceDragPayload(...args) { return assetUi.sourceDragPayload(...args); }
function insertSourceAt(...args) { return assetUi.insertSourceAt(...args); }
function placeSource(...args) { return assetUi.placeSource(...args); }
function hydrateDuration(...args) { return assetUi.hydrateDuration(...args); }
function probePaths(...args) { return assetUi.probePaths(...args); }
function importViaDialog(...args) { return assetUi.importViaDialog(...args); }

// --- timeline -------------------------------------------------------------

const timelineUi = globalThis.rendererTimelineUiLib.createRendererTimelineUi({
  L, T, S, P, state, dom, el, baseName, rate, displayTracks, contentFrames, edit, reportError,
  playbackPath: (...args) => playbackPath(...args),
  renderAssets: (...args) => renderAssets(...args),
  renderSourceMonitor: (...args) => renderSourceMonitor(...args),
  updateTitle: (...args) => updateTitle(...args),
  prepareDerivedMedia: (...args) => prepareDerivedMedia(...args),
  persistSettingsInBackground: (...args) => persistSettingsInBackground(...args),
});

function renderHeads(...args) { return timelineUi.renderHeads(...args); }
function clipElement(...args) { return timelineUi.clipElement(...args); }
function keyframeDot(...args) { return timelineUi.keyframeDot(...args); }
function visualElement(...args) { return timelineUi.visualElement(...args); }
function drawWaveform(...args) { return timelineUi.drawWaveform(...args); }
function renderLanes(...args) { return timelineUi.renderLanes(...args); }
function renderRuler(...args) { return timelineUi.renderRuler(...args); }
function renderMarkerList(...args) { return timelineUi.renderMarkerList(...args); }
function updateHistoryUi(...args) { return timelineUi.updateHistoryUi(...args); }
function updateMonitorZoomUi(...args) { return timelineUi.updateMonitorZoomUi(...args); }
function renderTimeline(...args) { return timelineUi.renderTimeline(...args); }
function checkLutFiles(...args) { return timelineUi.checkLutFiles(...args); }
function refresh(...args) { return timelineUi.refresh(...args); }
function updatePlayhead(...args) { return timelineUi.updatePlayhead(...args); }
function seekPreviousEdit(...args) { return timelineUi.seekPreviousEdit(...args); }
function seekNextEdit(...args) { return timelineUi.seekNextEdit(...args); }
function seekTimelineStart(...args) { return timelineUi.seekTimelineStart(...args); }
function seekTimelineEnd(...args) { return timelineUi.seekTimelineEnd(...args); }
function seekTimelineOffset(...args) { return timelineUi.seekTimelineOffset(...args); }
function followPlayhead(...args) { return timelineUi.followPlayhead(...args); }
function closeTimelineContextMenu(...args) { return timelineUi.closeTimelineContextMenu(...args); }
function openTimelineContextMenu(...args) { return timelineUi.openTimelineContextMenu(...args); }
function updateLinkUi(...args) { return timelineUi.updateLinkUi(...args); }
function selectAsset(...args) { return timelineUi.selectAsset(...args); }
function liveSelection(...args) { return timelineUi.liveSelection(...args); }
function splitAtPlayhead(...args) { return timelineUi.splitAtPlayhead(...args); }
function addMarker(...args) { return timelineUi.addMarker(...args); }
function visualTargetTrack(...args) { return timelineUi.visualTargetTrack(...args); }
function addVisualItem(...args) { return timelineUi.addVisualItem(...args); }
function addText(...args) { return timelineUi.addText(...args); }
function shapeTransform(...args) { return timelineUi.shapeTransform(...args); }
function addShape(...args) { return timelineUi.addShape(...args); }
function addSubtitle(...args) { return timelineUi.addSubtitle(...args); }
function importSrt(...args) { return timelineUi.importSrt(...args); }
function exportSrt(...args) { return timelineUi.exportSrt(...args); }
function deleteSelected(...args) { return timelineUi.deleteSelected(...args); }
function toggleClipLink(...args) { return timelineUi.toggleClipLink(...args); }
function setClipLut(...args) { return timelineUi.setClipLut(...args); }
function addAdjustmentLayer(...args) { return timelineUi.addAdjustmentLayer(...args); }
function addVisualKeyframesAt(...args) { return timelineUi.addVisualKeyframesAt(...args); }
function addVolumeKeyframeAt(...args) { return timelineUi.addVolumeKeyframeAt(...args); }

// --- project, render and settings -----------------------------------------

const projectUi = globalThis.rendererProjectUiLib.createRendererProjectUi({
  L, T, DEFAULT_SETTINGS, state, dom, el, adopt, reportError, errorText,
  projectDir, projectName, persistLatestSettings,
  refresh: (...args) => refresh(...args),
  prepareDerivedMedia: (...args) => prepareDerivedMedia(...args),
  adoptProxyStatuses: (...args) => adoptProxyStatuses(...args),
  renderProxySummary: (...args) => renderProxySummary(...args),
  renderProxyProgress: (...args) => renderProxyProgress(...args),
  renderTimeline: (...args) => renderTimeline(...args),
  rate: (...args) => rate(...args),
  updateMonitorZoomUi: (...args) => updateMonitorZoomUi(...args),
  updateTitle: (...args) => updateTitle(...args),
  updateToolWarning: (...args) => updateToolWarning(...args),
});

function persistSettings(...args) { return projectUi.persistSettings(...args); }
function persistSettingsInBackground(...args) { return projectUi.persistSettingsInBackground(...args); }
function toggleSnap(...args) { return projectUi.toggleSnap(...args); }
function startRender(...args) { return projectUi.startRender(...args); }
function onRenderProgress(...args) { return projectUi.onRenderProgress(...args); }
function onRenderFallback(...args) { return projectUi.onRenderFallback(...args); }
function onRenderDone(...args) { return projectUi.onRenderDone(...args); }
function confirmDiscard(...args) { return projectUi.confirmDiscard(...args); }
function loadDocument(...args) { return projectUi.loadDocument(...args); }
function newProject(...args) { return projectUi.newProject(...args); }
function createProjectFromSheet(...args) { return projectUi.createProjectFromSheet(...args); }
function openProject(...args) { return projectUi.openProject(...args); }
function openProjectPath(...args) { return projectUi.openProjectPath(...args); }
function qualitySmokeConfig(...args) { return projectUi.qualitySmokeConfig(...args); }
function saveProject(...args) { return projectUi.saveProject(...args); }
function closeProject(...args) { return projectUi.closeProject(...args); }
function deleteProject(...args) { return projectUi.deleteProject(...args); }
function openSheet(...args) { return projectUi.openSheet(...args); }
function closeSheet(...args) { return projectUi.closeSheet(...args); }
function anySheetOpen(...args) { return projectUi.anySheetOpen(...args); }
function fillProjectSheet(...args) { return projectUi.fillProjectSheet(...args); }
function accelerationNote(...args) { return projectUi.accelerationNote(...args); }
function staysOnCpu(...args) { return projectUi.staysOnCpu(...args); }
function compositorNote(...args) { return projectUi.compositorNote(...args); }
function fillGraphicsDevices(...args) { return projectUi.fillGraphicsDevices(...args); }
function fillAppSheet(...args) { return projectUi.fillAppSheet(...args); }
function fillProxySheet(...args) { return projectUi.fillProxySheet(...args); }
function applySettings(...args) { return projectUi.applySettings(...args); }
function attachMonitor(...args) { return projectUi.attachMonitor(...args); }

// --- menus and wiring ------------------------------------------------------

const wiring = globalThis.rendererWiringLib.createRendererWiring({
  L, T, state, dom, el, rate, reportError, newProject, openProject, saveProject,
  importViaDialog, deleteProject, closeProject, undoEdit, redoEdit, splitAtPlayhead,
  deleteSelected, seekTimelineOffset, seekPreviousEdit, seekNextEdit, seekTimelineStart,
  seekTimelineEnd, updateMonitorZoomUi, startRender, fillProxySheet, openSheet,
  fillProjectSheet, fillAppSheet, qualitySmokeConfig, accelerationNote, compositorNote,
  anySheetOpen, closeTimelineContextMenu, toggleSelectedPanel, refreshDebug, setSourceMark,
  placeSource, renderSourceMonitor, selectAsset, zoomToPxPerSecond, renderTimeline,
  updatePlayhead, toggleSnap, toggleClipLink, addText, addShape, addMarker, edit,
  addSubtitle, importSrt, exportSrt, renderHeads, frameAtClientX, openTimelineContextMenu,
  addVisualKeyframesAt, addVolumeKeyframeAt, setClipLut, addAdjustmentLayer,
  persistSettings, closeSheet, fillGraphicsDevices, createProjectFromSheet, openProjectPath,
  adoptProxyStatuses,
});
const actions = wiring.actions;

function closeMenus(...args) { return wiring.closeMenus(...args); }
function openMenu(...args) { return wiring.openMenu(...args); }
function wireMenus(...args) { return wiring.wireMenus(...args); }
function wireSelectedPanel(...args) { return wiring.wireSelectedPanel(...args); }
function wireAssets(...args) { return wiring.wireAssets(...args); }
function wireTimeline(...args) { return wiring.wireTimeline(...args); }
function wireSheets(...args) { return wiring.wireSheets(...args); }
function updateToolWarning(...args) { return wiring.updateToolWarning(...args); }
function subscribe(...args) { return wiring.subscribe(...args); }

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
