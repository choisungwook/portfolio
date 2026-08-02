'use strict';

// The DOM. Everything with an opinion about time lives in timeline.js and
// everything that plays lives in preview.js; this file listens, calls into
// them, and redraws.

const L = globalThis.timelineLib;

// Pointer distance from a clip edge that starts a trim instead of a move.
const HANDLE_PX = 8;
// How near an edge has to be before the magnet takes it, in pixels rather than
// milliseconds so it feels the same at every zoom.
const SNAP_PX = 10;

const el = (id) => document.getElementById(id);

const dom = {
  menus: el('menus'),
  projectName: el('project-name'),
  toolWarning: el('tool-warning'),
  assetList: el('asset-list'),
  assetEmpty: el('asset-empty'),
  assetsPanel: el('assets-panel'),
  btnImport: el('btn-import'),
  previewSource: el('preview-source'),
  stageWrap: el('stage-wrap'),
  stage: el('stage'),
  stageInner: el('stage-inner'),
  stageHint: el('stage-hint'),
  btnPlay: el('btn-play'),
  clock: el('clock'),
  duration: el('duration'),
  previewQuality: el('preview-quality'),
  btnSplit: el('btn-split'),
  btnMagnet: el('btn-magnet'),
  btnDelete: el('btn-delete'),
  btnAddVideo: el('btn-add-video'),
  btnAddAudio: el('btn-add-audio'),
  zoom: el('zoom'),
  timeline: el('timeline'),
  heads: el('timeline-heads'),
  scroll: el('timeline-scroll'),
  content: el('timeline-content'),
  ruler: el('ruler'),
  lanes: el('lanes'),
  playhead: el('playhead'),
  renderOverlay: el('render-overlay'),
  renderTitle: el('render-title'),
  renderBar: el('render-bar'),
  renderStatus: el('render-status'),
  renderCancel: el('render-cancel'),
  renderClose: el('render-close'),
};

const state = {
  project: L.createProject(),
  settings: null,
  boot: null,
  path: null,
  dirty: false,
  selectedClipId: null,
  selectedAssetId: null,
  pxPerSecond: 30,
  rendering: false,
};

let preview = null;

// --- helpers ---------------------------------------------------------------

function baseName(path) {
  return String(path).split(/[\\/]/).pop();
}

function stem(path) {
  return baseName(path).replace(/\.[^.]+$/, '');
}

function zoomToPxPerSecond(value) {
  return 5 * Math.pow(1.04, Number(value));
}

function snapTolerance() {
  return state.settings && state.settings.snap ? L.pxToMs(SNAP_PX, state.pxPerSecond) : 0;
}

function markDirty() {
  state.dirty = true;
  updateTitle();
}

function updateTitle() {
  const name = state.path ? stem(state.path) : 'Untitled';
  dom.projectName.textContent = state.dirty ? `${name} •` : name;
  window.api.setTitle(`akbun-makevideo — ${name}${state.dirty ? ' •' : ''}`);
}

function displayTracks() {
  // Video tracks read top down, so V1 is the bottom layer both on screen and
  // in the render. Audio hangs below them in its own order.
  return [...L.tracksOf(state.project, 'video')].reverse().concat(L.tracksOf(state.project, 'audio'));
}

function contentMs() {
  const visible = L.pxToMs(Math.max(dom.scroll.clientWidth, 320), state.pxPerSecond);
  return Math.max(L.projectDurationMs(state.project) + 10000, visible);
}

function timeAtClientX(clientX) {
  const box = dom.content.getBoundingClientRect();
  return Math.max(0, L.pxToMs(clientX - box.left, state.pxPerSecond));
}

// --- assets ----------------------------------------------------------------

function assetSummary(asset) {
  const bits = [asset.kind];
  if (asset.durationMs > 0) bits.push(L.formatTime(asset.durationMs));
  if (asset.width > 0) bits.push(`${asset.width}×${asset.height}`);
  if (asset.kind === 'video' && !asset.hasAudio) bits.push('silent');
  return bits.join(' · ');
}

function renderAssets() {
  dom.assetList.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const asset of state.project.assets) {
    const item = document.createElement('li');
    item.className = 'asset';
    item.dataset.id = asset.id;
    item.draggable = true;
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

/** An asset whose length ffprobe could not report is measured by the browser
 *  instead, once. Without this every clip of it would be five seconds long. */
function hydrateDuration(asset) {
  if (asset.durationMs > 0 || asset.kind === 'image') return;
  const probe = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
  probe.preload = 'metadata';
  probe.src = window.api.fileUrl(asset.path);
  probe.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(probe.duration) || probe.duration <= 0) return;
    const live = L.findAsset(state.project, asset.id);
    if (!live || live.durationMs > 0) return;
    live.durationMs = Math.round(probe.duration * 1000);
    if (probe.videoWidth) {
      live.width = probe.videoWidth;
      live.height = probe.videoHeight;
    }
    renderAssets();
  });
}

async function importPaths(paths) {
  if (!paths || !paths.length) return [];
  const imported = await window.api.importAssets(paths);
  if (!imported.length) {
    await window.api.message('None of those files are video, audio or images.', {
      title: 'Nothing imported',
    });
    return [];
  }
  L.addAssets(state.project, imported);
  for (const asset of imported) hydrateDuration(asset);
  markDirty();
  renderAssets();
  return imported;
}

async function importViaDialog() {
  const picked = await window.api.pickMedia();
  if (!picked) return;
  await importPaths(Array.isArray(picked) ? picked : [picked]);
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
    if (track.kind === 'video') {
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
  node.style.left = `${L.msToPx(clip.startMs, state.pxPerSecond)}px`;
  node.style.width = `${Math.max(2, L.msToPx(L.clipDuration(clip), state.pxPerSecond))}px`;
  if (clip.id === state.selectedClipId) node.classList.add('selected');

  const label = document.createElement('span');
  label.className = 'clip-name';
  label.textContent = asset ? asset.name || baseName(asset.path) : 'missing file';
  if (!asset) node.classList.add('missing');
  const left = document.createElement('span');
  left.className = 'handle left';
  const right = document.createElement('span');
  right.className = 'handle right';
  node.append(left, label, right);
  return node;
}

function renderLanes() {
  dom.lanes.textContent = '';
  const width = L.msToPx(contentMs(), state.pxPerSecond);
  dom.content.style.width = `${width}px`;

  for (const track of displayTracks()) {
    const lane = document.createElement('div');
    lane.className = `lane ${track.kind}`;
    lane.dataset.trackId = track.id;
    if (track.hidden) lane.classList.add('off');
    if (track.muted) lane.classList.add('muted');
    for (const clip of track.clips) lane.appendChild(clipElement(track, clip));
    dom.lanes.appendChild(lane);
  }
}

function renderRuler() {
  dom.ruler.textContent = '';
  const total = contentMs();
  const step = L.tickStepMs(state.pxPerSecond);
  const fragment = document.createDocumentFragment();
  for (let time = 0; time <= total; time += step) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = `${L.msToPx(time, state.pxPerSecond)}px`;
    tick.textContent = L.formatTime(time).replace(/^0:/, '').replace(/\.00$/, '');
    fragment.appendChild(tick);
  }
  dom.ruler.appendChild(fragment);
}

function renderTimeline() {
  renderHeads();
  renderRuler();
  renderLanes();
  updatePlayhead(preview ? preview.position() : 0);
  dom.duration.textContent = L.formatTime(L.projectDurationMs(state.project));
  dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
  dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
}

function refresh() {
  renderAssets();
  renderTimeline();
  if (preview) {
    preview.prune();
    preview.layout();
  }
  updateTitle();
}

function updatePlayhead(ms) {
  dom.playhead.style.left = `${L.msToPx(ms, state.pxPerSecond)}px`;
  dom.clock.textContent = L.formatTime(ms);
  dom.stageHint.hidden = L.projectDurationMs(state.project) > 0 || preview.mode() === 'asset';
}

/** Keep the playhead on screen while it runs, without fighting a user who is
 *  scrolling somewhere else. */
function followPlayhead(ms) {
  if (!preview.isPlaying()) return;
  const x = L.msToPx(ms, state.pxPerSecond);
  const left = dom.scroll.scrollLeft;
  const right = left + dom.scroll.clientWidth;
  if (x < left || x > right - 40) dom.scroll.scrollLeft = Math.max(0, x - dom.scroll.clientWidth * 0.3);
}

// --- selection and editing -------------------------------------------------

function selectClip(clipId) {
  state.selectedClipId = clipId;
  for (const node of dom.lanes.querySelectorAll('.clip')) {
    node.classList.toggle('selected', node.dataset.clipId === clipId);
  }
}

function selectAsset(assetId) {
  state.selectedAssetId = assetId;
  renderAssets();
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
  const created = L.splitAt(state.project, preview.position(), liveSelection() || undefined);
  if (!created.length) return;
  markDirty();
  renderTimeline();
}

function deleteSelected() {
  if (!liveSelection()) return;
  if (!L.removeClip(state.project, state.selectedClipId)) return;
  state.selectedClipId = null;
  markDirty();
  preview.prune();
  renderTimeline();
}

function toggleSnap() {
  state.settings.snap = !state.settings.snap;
  window.api.saveSettings(state.settings);
  dom.btnMagnet.classList.toggle('on', state.settings.snap);
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
    grabMs: L.pxToMs(offsetX, state.pxPerSecond),
    startMs: found.clip.startMs,
    endMs: L.clipEnd(found.clip),
    durationMs: L.clipDuration(found.clip),
    trackId: found.track.id,
    targetTrackId: found.track.id,
    nextStartMs: found.clip.startMs,
    nextEdgeMs: found.clip.startMs,
    moved: false,
  };
  document.body.classList.add(mode === 'move' ? 'dragging' : 'trimming');
  event.preventDefault();
}

function updateClipDrag(event) {
  const pointerMs = timeAtClientX(event.clientX);
  const tolerance = snapTolerance();

  if (drag.mode === 'move') {
    const wanted = Math.max(0, pointerMs - drag.grabMs);
    drag.nextStartMs = L.snapClipStart(state.project, wanted, drag.durationMs, tolerance, {
      exceptClipId: drag.clipId,
      extra: [preview.position()],
    });
    drag.node.style.left = `${L.msToPx(drag.nextStartMs, state.pxPerSecond)}px`;

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
    const snapped = L.snapTime(state.project, pointerMs, tolerance, {
      exceptClipId: drag.clipId,
      extra: [preview.position()],
    });
    drag.nextEdgeMs = snapped;
    if (drag.mode === 'trim-start') {
      const at = Math.min(snapped, drag.endMs - L.MIN_CLIP_MS);
      drag.node.style.left = `${L.msToPx(Math.max(0, at), state.pxPerSecond)}px`;
      drag.node.style.width = `${Math.max(2, L.msToPx(drag.endMs - at, state.pxPerSecond))}px`;
    } else {
      const at = Math.max(snapped, drag.startMs + L.MIN_CLIP_MS);
      drag.node.style.width = `${Math.max(2, L.msToPx(at - drag.startMs, state.pxPerSecond))}px`;
    }
  }
  drag.moved = true;
}

function endClipDrag() {
  const current = drag;
  drag = null;
  document.body.classList.remove('dragging', 'trimming');
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  if (!current) return;
  if (current.moved) {
    if (current.mode === 'move') {
      L.moveClip(state.project, current.clipId, current.targetTrackId, current.nextStartMs);
    } else {
      L.trimClip(
        state.project,
        current.clipId,
        current.mode === 'trim-start' ? 'start' : 'end',
        current.nextEdgeMs
      );
    }
    markDirty();
  }
  renderTimeline();
}

// --- scrubbing -------------------------------------------------------------

let scrubbing = false;

function scrubTo(clientX) {
  const tolerance = snapTolerance();
  preview.seek(L.snapTime(state.project, timeAtClientX(clientX), tolerance));
}

function beginScrub(event) {
  scrubbing = true;
  preview.setScrubbing(true);
  scrubTo(event.clientX);
  event.preventDefault();
}

// --- dropping --------------------------------------------------------------

/** Place assets one after another from the drop point, so dropping three files
 *  on a track lays them end to end instead of stacking them all at once. */
function dropAssetsOnTrack(trackId, assets, atMs) {
  const track = L.findTrack(state.project, trackId);
  if (!track) return false;
  let cursor = atMs;
  let placed = false;
  for (const asset of assets) {
    if (!L.canAccept(track, asset)) continue;
    const clip = L.addClip(state.project, trackId, asset.id, cursor);
    if (!clip) continue;
    cursor = L.clipEnd(clip);
    placed = true;
    state.selectedClipId = clip.id;
  }
  return placed;
}

function laneAtPoint(x, y) {
  const under = document.elementFromPoint(x, y);
  if (!under || !under.closest) return null;
  return under.closest('.lane');
}

async function handleOsDrop(payload) {
  if (payload.type === 'over') {
    const point = payload.position || { x: 0, y: 0 };
    const ratio = window.devicePixelRatio || 1;
    const lane = laneAtPoint(point.x / ratio, point.y / ratio);
    for (const node of dom.lanes.querySelectorAll('.lane')) {
      node.classList.toggle('drop-target', node === lane);
    }
    dom.assetsPanel.classList.toggle('drop-target', !lane);
    return;
  }
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  dom.assetsPanel.classList.remove('drop-target');
  if (payload.type !== 'drop') return;

  // The event carries physical pixels; elementFromPoint wants CSS pixels.
  const point = payload.position || { x: 0, y: 0 };
  const ratio = window.devicePixelRatio || 1;
  const x = point.x / ratio;
  const y = point.y / ratio;
  const lane = laneAtPoint(x, y);

  const imported = await importPaths(payload.paths || []);
  if (!imported.length || !lane) {
    refresh();
    return;
  }
  const tolerance = snapTolerance();
  const at = L.snapTime(state.project, timeAtClientX(x), tolerance);
  if (dropAssetsOnTrack(lane.dataset.trackId, imported, at)) markDirty();
  refresh();
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
  if (L.projectDurationMs(state.project) <= 0) {
    await window.api.message('The timeline is empty.', { title: 'Nothing to render' });
    return;
  }
  const suggested = `${state.path ? stem(state.path) : 'untitled'}-${preset}.mp4`;
  const output = await window.api.pickRenderOutput(suggested);
  if (!output) return;

  state.rendering = true;
  preview.pause();
  dom.renderTitle.textContent = `Rendering ${preset.toUpperCase()}`;
  dom.renderStatus.textContent = 'Starting ffmpeg…';
  dom.renderBar.style.width = '0%';
  dom.renderCancel.hidden = false;
  dom.renderClose.hidden = true;
  dom.renderOverlay.hidden = false;
  try {
    await window.api.startRender(output, state.project, preset);
  } catch (error) {
    state.rendering = false;
    dom.renderOverlay.hidden = true;
    await window.api.message(String(error), { title: 'Render failed', kind: 'error' });
  }
}

function onRenderProgress(payload) {
  if (!state.rendering) return;
  const percent = payload.totalMs > 0 ? Math.min(100, (payload.positionMs / payload.totalMs) * 100) : 0;
  dom.renderBar.style.width = `${percent}%`;
  dom.renderStatus.textContent = `${L.formatTime(payload.positionMs)} of ${L.formatTime(payload.totalMs)} — ${Math.round(percent)}%`;
}

function onRenderDone(payload) {
  state.rendering = false;
  dom.renderCancel.hidden = true;
  dom.renderClose.hidden = false;
  if (payload.ok) {
    dom.renderBar.style.width = '100%';
    dom.renderTitle.textContent = 'Render finished';
    dom.renderStatus.textContent = payload.path;
  } else {
    dom.renderTitle.textContent = payload.cancelled ? 'Render cancelled' : 'Render failed';
    dom.renderStatus.textContent = payload.message || '';
  }
}

// --- project files ---------------------------------------------------------

async function confirmDiscard(what) {
  if (!state.dirty) return true;
  return window.api.ask(`This project has unsaved changes. ${what} anyway?`, {
    title: 'Unsaved changes',
    kind: 'warning',
  });
}

function loadProject(project, path) {
  state.project = L.normalize(project);
  state.path = path || null;
  state.dirty = false;
  state.selectedClipId = null;
  state.selectedAssetId = null;
  preview.clear();
  preview.showTimeline();
  setPreviewSource('timeline');
  for (const asset of state.project.assets) hydrateDuration(asset);
  refresh();
}

async function newProject() {
  if (!(await confirmDiscard('Start a new project'))) return;
  loadProject(
    L.createProject({
      width: state.settings.defaultWidth,
      height: state.settings.defaultHeight,
      fps: state.settings.defaultFps,
    }),
    null
  );
}

async function openProject() {
  if (!(await confirmDiscard('Open another project'))) return;
  const path = await window.api.pickProjectOpen();
  if (!path) return;
  try {
    const project = await window.api.openProject(path);
    loadProject(project, path);
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot open', kind: 'error' });
  }
}

async function saveProject(forcePicker) {
  let path = state.path;
  if (!path || forcePicker) {
    path = await window.api.pickProjectSave(`${state.path ? stem(state.path) : 'untitled'}.akbunvideo`);
    if (!path) return false;
  }
  try {
    await window.api.saveProject(path, state.project);
    state.path = path;
    state.dirty = false;
    updateTitle();
    return true;
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
    return false;
  }
}

async function closeProject() {
  if (!(await confirmDiscard('Close this project'))) return;
  loadProject(
    L.createProject({
      width: state.settings.defaultWidth,
      height: state.settings.defaultHeight,
      fps: state.settings.defaultFps,
    }),
    null
  );
}

// --- settings sheets -------------------------------------------------------

function openSheet(id) {
  el(id).hidden = false;
}

function closeSheet(id) {
  el(id).hidden = true;
}

function fillProjectSheet() {
  const { width, height, fps } = state.project.settings;
  el('ps-width').value = width;
  el('ps-height').value = height;
  el('ps-fps').value = String(fps);
  const key = `${width}x${height}`;
  const preset = el('ps-preset');
  preset.value = [...preset.options].some((option) => option.value === key) ? key : 'custom';
}

function fillAppSheet() {
  el('as-quality').value = state.settings.previewQuality;
  el('as-scrub-mute').checked = state.settings.previewMuteWhileScrubbing;
  el('as-snap').checked = state.settings.snap;
  el('as-theme').value = state.settings.theme;
  el('as-ffmpeg').value = state.settings.ffmpegDir;
  el('as-tools').textContent = state.boot.ffmpeg
    ? `Found ffmpeg at ${state.boot.ffmpeg}`
    : 'ffmpeg was not found. Rendering is unavailable until it is.';
}

function applySettings(next) {
  state.settings = next;
  preview.setQuality(next.previewQuality);
  preview.setMuteWhileScrubbing(next.previewMuteWhileScrubbing);
  dom.previewQuality.value = next.previewQuality;
  dom.btnMagnet.classList.toggle('on', next.snap);
}

// --- menus -----------------------------------------------------------------

function closeMenus() {
  for (const list of dom.menus.querySelectorAll('.menu-list')) list.classList.remove('open');
  for (const title of dom.menus.querySelectorAll('.menu-title')) title.classList.remove('open');
}

function openMenu(name) {
  const wasOpen = dom.menus.querySelector(`[data-list="${name}"]`).classList.contains('open');
  closeMenus();
  if (wasOpen) return;
  dom.menus.querySelector(`[data-list="${name}"]`).classList.add('open');
  dom.menus.querySelector(`[data-menu="${name}"]`).classList.add('open');
}

const actions = {
  'new-project': newProject,
  'open-project': openProject,
  'save-project': () => saveProject(false),
  'save-project-as': () => saveProject(true),
  'import-assets': importViaDialog,
  'close-project': closeProject,
  'render-fhd': () => startRender('fhd'),
  'render-4k': () => startRender('4k'),
  'cancel-render': () => window.api.cancelRender(),
  'project-settings': () => {
    fillProjectSheet();
    openSheet('project-settings');
  },
  'app-settings': () => {
    fillAppSheet();
    openSheet('app-settings');
  },
  'check-update': () => window.api.checkUpdate(),
  about: () =>
    window.api.message(
      [
        `akbun-makevideo ${state.boot.version}`,
        `settings: ${state.boot.dataDir}`,
        `ffmpeg: ${state.boot.ffmpeg || 'not found'}`,
        `ffprobe: ${state.boot.ffprobe || 'not found'}`,
      ].join('\n'),
      { title: 'About' }
    ),
};

// --- preview source --------------------------------------------------------

function setPreviewSource(source) {
  for (const button of dom.previewSource.querySelectorAll('button')) {
    button.classList.toggle('on', button.dataset.source === source);
  }
  if (source === 'asset') {
    const asset = state.selectedAssetId && L.findAsset(state.project, state.selectedAssetId);
    preview.showAsset(asset || null);
    dom.stageHint.hidden = Boolean(asset);
    if (!asset) dom.stageHint.textContent = 'Select an asset on the left to preview it.';
  } else {
    preview.showTimeline();
    dom.stageHint.textContent = 'Drop media on the timeline below to see it here.';
  }
  preview.layout();
  dom.duration.textContent = L.formatTime(preview.total());
}

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
    if (run) run();
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
  });
}

function wireAssets() {
  dom.btnImport.addEventListener('click', importViaDialog);
  dom.assetList.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      L.removeAsset(state.project, remove.dataset.remove);
      if (state.selectedAssetId === remove.dataset.remove) state.selectedAssetId = null;
      markDirty();
      preview.prune();
      refresh();
      return;
    }
    const item = event.target.closest('.asset');
    if (!item) return;
    selectAsset(item.dataset.id);
    if (preview.mode() === 'asset') setPreviewSource('asset');
  });
  dom.assetList.addEventListener('dblclick', (event) => {
    const item = event.target.closest('.asset');
    if (!item) return;
    setPreviewSource('asset');
  });
  dom.assetList.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.asset');
    if (!item) return;
    event.dataTransfer.setData('text/plain', item.dataset.id);
    event.dataTransfer.effectAllowed = 'copy';
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
  dom.btnDelete.addEventListener('click', deleteSelected);
  dom.btnAddVideo.addEventListener('click', () => {
    if (!L.addTrack(state.project, 'video')) return;
    markDirty();
    renderTimeline();
  });
  dom.btnAddAudio.addEventListener('click', () => {
    if (!L.addTrack(state.project, 'audio')) return;
    markDirty();
    renderTimeline();
  });

  dom.heads.addEventListener('click', (event) => {
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    const track = L.findTrack(state.project, button.closest('.head').dataset.trackId);
    if (!track) return;
    track[button.dataset.toggle] = !track[button.dataset.toggle];
    markDirty();
    renderTimeline();
  });

  dom.ruler.addEventListener('pointerdown', beginScrub);
  dom.lanes.addEventListener('pointerdown', (event) => {
    const clip = event.target.closest('.clip');
    if (clip) {
      beginClipDrag(event, clip);
      return;
    }
    selectClip(null);
    beginScrub(event);
  });

  window.addEventListener('pointermove', (event) => {
    if (drag) updateClipDrag(event);
    else if (scrubbing) scrubTo(event.clientX);
  });
  window.addEventListener('pointerup', () => {
    if (drag) endClipDrag();
    if (scrubbing) {
      scrubbing = false;
      preview.setScrubbing(false);
    }
  });

  // Dragging an asset out of the panel and onto a lane.
  dom.lanes.addEventListener('dragover', (event) => {
    const lane = event.target.closest('.lane');
    if (!lane) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    for (const node of dom.lanes.querySelectorAll('.lane')) {
      node.classList.toggle('drop-target', node === lane);
    }
  });
  dom.lanes.addEventListener('dragleave', (event) => {
    const lane = event.target.closest('.lane');
    if (lane) lane.classList.remove('drop-target');
  });
  dom.lanes.addEventListener('drop', (event) => {
    const lane = event.target.closest('.lane');
    for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
    if (!lane) return;
    event.preventDefault();
    const assetId = event.dataTransfer.getData('text/plain');
    const asset = L.findAsset(state.project, assetId);
    if (!asset) return;
    const at = L.snapTime(state.project, timeAtClientX(event.clientX), snapTolerance());
    if (dropAssetsOnTrack(lane.dataset.trackId, [asset], at)) {
      markDirty();
      renderTimeline();
    }
  });
}

function wireTransport() {
  dom.btnPlay.addEventListener('click', () => preview.toggle());
  dom.previewQuality.addEventListener('change', () => {
    state.settings.previewQuality = dom.previewQuality.value;
    preview.setQuality(state.settings.previewQuality);
    window.api.saveSettings(state.settings);
  });
  dom.previewSource.addEventListener('click', (event) => {
    const button = event.target.closest('[data-source]');
    if (button) setPreviewSource(button.dataset.source);
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
  el('ps-save').addEventListener('click', () => {
    state.project.settings = {
      width: Math.max(16, Number(el('ps-width').value) || 1920),
      height: Math.max(16, Number(el('ps-height').value) || 1080),
      fps: Number(el('ps-fps').value) || 30,
    };
    closeSheet('project-settings');
    markDirty();
    preview.layout();
  });
  el('as-save').addEventListener('click', async () => {
    const next = Object.assign({}, state.settings, {
      previewQuality: el('as-quality').value,
      previewMuteWhileScrubbing: el('as-scrub-mute').checked,
      snap: el('as-snap').checked,
      theme: el('as-theme').value,
      ffmpegDir: el('as-ffmpeg').value.trim(),
    });
    closeSheet('app-settings');
    state.boot = await window.api.saveSettings(next);
    applySettings(state.boot.settings);
    updateToolWarning();
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
    const meta = event.metaKey || event.ctrlKey;

    if (event.key === 'Escape') {
      closeMenus();
      for (const sheet of document.querySelectorAll('.overlay')) {
        if (sheet.id !== 'render-overlay' || !state.rendering) sheet.hidden = true;
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      splitAtPlayhead();
      return;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveProject(event.shiftKey);
      return;
    }
    if (meta && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      openProject();
      return;
    }
    if (meta && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      newProject();
      return;
    }
    if (meta && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      importViaDialog();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      preview.toggle();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.shiftKey ? 1000 : 1000 / (state.project.settings.fps || 30);
      preview.seek(preview.position() + (event.key === 'ArrowRight' ? step : -step));
      return;
    }
    if (event.key === 'Home') preview.seek(0);
  });
}

function updateToolWarning() {
  dom.toolWarning.hidden = Boolean(state.boot && state.boot.ffmpeg);
}

async function boot() {
  state.boot = await window.api.bootstrap();
  state.settings = state.boot.settings;
  state.pxPerSecond = zoomToPxPerSecond(dom.zoom.value);

  preview = globalThis.previewLib.createPreview({
    stage: dom.stage,
    inner: dom.stageInner,
    wrap: dom.stageWrap,
    getProject: () => state.project,
    onTick: (ms, playing) => {
      updatePlayhead(ms);
      followPlayhead(ms);
      dom.btnPlay.textContent = playing ? '❚❚' : '▶';
    },
  });

  state.project = L.createProject({
    width: state.settings.defaultWidth,
    height: state.settings.defaultHeight,
    fps: state.settings.defaultFps,
  });
  applySettings(state.settings);
  updateToolWarning();

  wireMenus();
  wireAssets();
  wireTimeline();
  wireTransport();
  wireSheets();
  wireKeyboard();

  window.api.onRenderProgress(onRenderProgress);
  window.api.onRenderDone(onRenderDone);
  window.api.onFileDrop(handleOsDrop);
  window.api.onCloseRequested(async (event) => {
    if (state.dirty) {
      if (event && event.preventDefault) event.preventDefault();
      if (!(await confirmDiscard('Quit'))) return;
    }
    window.api.closeWindow();
  });
  window.addEventListener('resize', () => renderTimeline());

  refresh();
  setPreviewSource('timeline');
}

// lib.rs opens the devtools in debug builds because the window is the whole
// app, and nearly every question asked there is a question about this state.
// One name, so nothing else on the page is shadowed.
globalThis.makevideo = {
  state,
  refresh,
  preview: () => preview,
  lib: L,
};

boot();
