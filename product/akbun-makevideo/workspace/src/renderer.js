'use strict';

// The DOM. Everything with an opinion about time lives in timeline.js and
// everything that plays lives in preview.js; this file listens, calls into
// them, and redraws.

const L = globalThis.timelineLib;
const T = globalThis.timeLib;

// Pointer distance from a clip edge that starts a trim instead of a move.
const HANDLE_PX = 8;
// How near an edge has to be before the magnet takes it, in pixels rather than
// frames so it feels the same at every zoom.
const SNAP_PX = 10;
// How much timeline is kept past the end of the edit, so there is always
// somewhere to drop the next clip.
const TAIL_SECONDS = 10;

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
  stageExact: el('stage-exact'),
  stageMode: el('stage-mode'),
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
let qualityMonitor = null;

// --- helpers ---------------------------------------------------------------

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

function snapTolerance() {
  if (!(state.settings && state.settings.snap)) return 0;
  return Math.round(L.pxToFrames(SNAP_PX, rate(), state.pxPerSecond));
}

function markDirty() {
  state.dirty = true;
  updateTitle();
}

function updateTitle() {
  const name = projectName();
  dom.projectName.textContent = state.dirty ? `${name} •` : name;
  window.api.setTitle(`akbun-makevideo — ${name}${state.dirty ? ' •' : ''}`);
}

function displayTracks() {
  // Video tracks read top down, so V1 is the bottom layer both on screen and
  // in the render. Audio hangs below them in its own order.
  return [...L.tracksOf(state.project, 'video')].reverse().concat(L.tracksOf(state.project, 'audio'));
}

/** How many frames of timeline the ruler and the lanes are drawn for. */
function contentFrames() {
  const visible = L.pxToFrames(Math.max(dom.scroll.clientWidth, 320), rate(), state.pxPerSecond);
  const tail = Math.round(TAIL_SECONDS * T.rateToNumber(rate()));
  return Math.max(L.projectDurationFrames(state.project) + tail, visible);
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
  return bits.join(' · ');
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
  node.style.left = `${L.framesToPx(clip.start, rate(), state.pxPerSecond)}px`;
  node.style.width = `${Math.max(2, L.framesToPx(L.clipDuration(clip), rate(), state.pxPerSecond))}px`;
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
  const width = L.framesToPx(contentFrames(), rate(), state.pxPerSecond);
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
}

function renderTimeline() {
  renderHeads();
  renderRuler();
  renderLanes();
  updatePlayhead(preview ? preview.position() : 0);
  dom.duration.textContent = L.formatTimecode(L.projectDurationFrames(state.project), rate());
  dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
  dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
  scheduleExactFrame();
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

function updatePlayhead(frame) {
  dom.playhead.style.left = `${L.framesToPx(frame, rate(), state.pxPerSecond)}px`;
  dom.clock.textContent = L.formatTimecode(frame, rate());
  dom.stageHint.hidden = L.projectDurationFrames(state.project) > 0 || preview.mode() === 'asset';
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
  const known = mode === 'exact' || mode === 'live';
  dom.stageMode.hidden = !known || L.projectDurationFrames(state.project) <= 0;
  dom.stageMode.textContent = mode === 'exact' ? 'exact frame' : 'live preview';
  dom.stageMode.classList.toggle('exact', mode === 'exact');
}

/** Ask Rust for the frame the render would produce here. It costs an ffmpeg
 *  call per visible clip, so it is only ever asked for when the playhead has
 *  stopped, and a newer request cancels an older one by token. */
async function requestExactFrame() {
  if (!window.api.available) return;
  if (preview.isPlaying() || preview.mode() !== 'timeline') return;
  if (L.projectDurationFrames(state.project) <= 0) return;
  if (state.settings.compositor === 'ffmpeg') return;
  const token = (exactToken += 1);
  const box = dom.stageInner.getBoundingClientRect();
  const maxWidth = Math.max(160, Math.round(box.width));
  try {
    const drawn = await window.api.previewFrame(
      state.project,
      Math.round(preview.position()),
      maxWidth
    );
    if (token !== exactToken || preview.isPlaying()) return;
    setStageMode(preview.showExact(drawn) ? 'exact' : 'live');
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
  if (preview.isPlaying() || preview.mode() !== 'timeline') return;
  exactTimer = window.setTimeout(requestExactFrame, 180);
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

function endClipDrag() {
  const current = drag;
  drag = null;
  document.body.classList.remove('dragging', 'trimming');
  for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
  if (!current) return;
  if (current.moved) {
    if (current.mode === 'move') {
      L.moveClip(state.project, current.clipId, current.targetTrackId, current.nextStart);
    } else {
      L.trimClip(
        state.project,
        current.clipId,
        current.mode === 'trim-start' ? 'start' : 'end',
        current.nextEdge
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
  preview.seek(L.snapTime(state.project, frameAtClientX(clientX), tolerance));
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
function dropAssetsOnTrack(trackId, assets, atFrame) {
  const track = L.findTrack(state.project, trackId);
  if (!track) return false;
  let cursor = atFrame;
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
  for (const node of dom.lanes.querySelectorAll('.lane')) {
    node.classList.toggle('drop-target', node === lane);
  }
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
  return current;
}

function endAssetDrag(event) {
  const current = clearAssetDrag();
  if (!current) return;

  const lane = laneAtPoint(event.clientX, event.clientY);
  if (!lane) return;
  const at = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
  if (!dropAssetsOnTrack(lane.dataset.trackId, [current.asset], at)) return;
  markDirty();
  renderTimeline();
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
  const at = L.snapTime(state.project, frameAtClientX(x), tolerance);
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
    await window.api.startRender(output, state.project, preset);
  } catch (error) {
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
    dom.renderStatus.textContent = `${payload.path}${how}`;
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

function emptyProject() {
  return L.createProject({
    width: state.settings.defaultWidth,
    height: state.settings.defaultHeight,
    rate: state.settings.defaultRate,
  });
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
    loadProject(emptyProject(), entry.path);
    // Written immediately: an empty folder with no project file in it would not
    // show up in Open, and would look like the project was never made.
    await window.api.saveProject(entry.path, state.project);
    state.dirty = false;
    updateTitle();
  } catch (failure) {
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
    const project = await window.api.openProject(path);
    loadProject(project, path);
    return true;
  } catch (error) {
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
  loadProject(emptyProject(), null);
}

// --- settings sheets -------------------------------------------------------

function openSheet(id) {
  el(id).hidden = false;
}

function closeSheet(id) {
  el(id).hidden = true;
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

/** What is drawing, and what the choice costs. */
function compositorNote() {
  const found = (state.boot && state.boot.compositor) || {};
  if (found.setting === 'ffmpeg') {
    return 'The filter graph draws the render, and the preview is drawn separately by the browser, so the two can differ. Faster, because frames never leave ffmpeg.';
  }
  const same =
    'The preview frame and the render come out of the same code, at the cost of every frame crossing a pipe.';
  if (found.fellBack) {
    return `No graphics device was found, so ${found.device} is drawing. Same picture, slower. ${same}`;
  }
  return `Drawing with ${found.device || 'the software compositor'}. ${same}`;
}

function fillAppSheet() {
  el('as-quality').value = state.settings.previewQuality;
  el('as-scrub-mute').checked = state.settings.previewMuteWhileScrubbing;
  el('as-snap').checked = state.settings.snap;
  el('as-theme').value = state.settings.theme;
  el('as-workspace').value = state.settings.workspaceDir;
  el('as-workspace-note').textContent = `Projects are folders in ${state.boot.workspace}. Imported media stays where it is — nothing is copied in here.`;
  el('as-compositor').value = state.settings.compositor;
  el('as-compositor-note').textContent = compositorNote();
  el('as-accel').value = state.settings.renderAcceleration;
  el('as-accel-note').textContent = accelerationNote();
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
        compositorNote(),
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
    preview.clearExact();
    setStageMode('');
    const asset = state.selectedAssetId && L.findAsset(state.project, state.selectedAssetId);
    preview.showAsset(asset || null);
    dom.stageHint.hidden = Boolean(asset);
    if (!asset) dom.stageHint.textContent = 'Select an asset on the left to preview it.';
  } else {
    preview.showTimeline();
    dom.stageHint.textContent = 'Drop media on the timeline below to see it here.';
  }
  preview.layout();
  dom.duration.textContent = L.formatTimecode(preview.total(), rate());
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
  // The webview brings its own right-click menu, and the first item on it is
  // Reload. The project lives in this page and nowhere else until it is saved,
  // so that one click empties the assets and the timeline with no warning.
  // Text fields keep their menu, because copy and paste belong there.
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('input, textarea')) event.preventDefault();
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
  dom.assetList.addEventListener('pointerdown', beginAssetDrag);
  window.addEventListener('pointermove', (event) => {
    if (assetDrag) updateAssetDrag(event);
  });
  window.addEventListener('pointerup', endAssetDrag);
  window.addEventListener('pointercancel', clearAssetDrag);
  window.addEventListener('blur', clearAssetDrag);
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
}

function wireTransport() {
  dom.btnPlay.addEventListener('click', () => preview.toggle());
  dom.previewQuality.addEventListener('change', () => {
    const previous = state.settings.previewQuality;
    state.settings.previewQuality = dom.previewQuality.value;
    preview.setQuality(state.settings.previewQuality);
    persistSettings(() => {
      state.settings.previewQuality = previous;
      dom.previewQuality.value = previous;
      preview.setQuality(previous);
    });
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
    const at = preview.position();
    const was = rate();
    state.project.settings.width = Math.max(16, Number(el('ps-width').value) || 1920);
    state.project.settings.height = Math.max(16, Number(el('ps-height').value) || 1080);
    // The clips move with the timebase rather than keeping their frame
    // numbers, so a cut stays where it was in time.
    L.retime(state.project, T.parseRate(el('ps-rate').value));
    closeSheet('project-settings');
    markDirty();
    preview.seek(T.rescale(at, was, rate()));
    preview.layout();
    renderTimeline();
  });
  el('as-save').addEventListener('click', async () => {
    const next = Object.assign({}, state.settings, {
      previewQuality: el('as-quality').value,
      previewMuteWhileScrubbing: el('as-scrub-mute').checked,
      snap: el('as-snap').checked,
      theme: el('as-theme').value,
      compositor: el('as-compositor').value,
      renderAcceleration: el('as-accel').value,
      workspaceDir: el('as-workspace').value.trim(),
      ffmpegDir: el('as-ffmpeg').value.trim(),
    });
    closeSheet('app-settings');
    try {
      state.boot = await window.api.saveSettings(next);
    } catch (error) {
      await window.api.message(`Those settings could not be saved.\n\n${error}`, {
        title: 'Settings',
        kind: 'error',
      });
      return;
    }
    applySettings(state.boot.settings);
    updateToolWarning();
  });
  el('as-workspace-pick').addEventListener('click', async () => {
    const folder = await window.api.pickFolder('Workspace folder');
    if (folder) el('as-workspace').value = folder;
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
      // One frame, or a second with shift. A frame is 1 now, which is the
      // point of counting in them.
      const step = event.shiftKey ? Math.round(T.rateToNumber(rate())) : 1;
      const at = Math.round(preview.position());
      preview.seek(at + (event.key === 'ArrowRight' ? step : -step));
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

  qualityMonitor = globalThis.qualityLib.createQualityMonitor({});
  preview = globalThis.previewLib.createPreview({
    stage: dom.stage,
    inner: dom.stageInner,
    exactCanvas: dom.stageExact,
    wrap: dom.stageWrap,
    getProject: () => state.project,
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

  state.project = L.createProject({
    width: state.settings.defaultWidth,
    height: state.settings.defaultHeight,
    rate: state.settings.defaultRate,
  });
  applySettings(state.settings);
  globalThis.makevideoQuality = globalThis.qualityLib.createQualityHarness({
    monitor: qualityMonitor,
    preview,
    getProject: () => state.project,
    refresh,
    memoryBytes: window.api.processMemoryBytes,
    saveReport: window.api.saveQualityReport,
  });
  updateToolWarning();

  wireMenus();
  wireAssets();
  wireTimeline();
  wireTransport();
  wireSheets();
  wireKeyboard();

  window.api.onRenderProgress(onRenderProgress);
  window.api.onRenderDone(onRenderDone);
  window.api.onRenderFallback(onRenderFallback);
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
