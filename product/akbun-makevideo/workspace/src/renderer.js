'use strict';

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
  btnRipple: el('btn-ripple'),
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
  // What Rust last said the document is. `project` is the same object as
  // `doc.project`, kept under its own name because most of the page only cares
  // about the timeline and not about how many undo steps there are.
  doc: null,
  project: L.blankProject(),
  // The revision the file on disk holds. Dirty is a comparison rather than a
  // flag, which means undoing back to where the last save was leaves the
  // project clean again instead of permanently modified.
  savedRevision: 0,
  settings: null,
  boot: null,
  path: null,
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
  dom.projectName.textContent = `${name}${mark}`;
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

function renderTimeline() {
  renderHeads();
  renderRuler();
  renderLanes();
  updatePlayhead(preview ? preview.position() : 0);
  dom.duration.textContent = L.formatTimecode(L.projectDurationFrames(state.project), rate());
  dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
  dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
  dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
  updateHistoryUi();
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
    const drawn = await window.api.previewFrame(Math.round(preview.position()), maxWidth);
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
  return edit({
    op: 'splitAt',
    frame: Math.round(preview.position()),
    clipId: liveSelection(),
  });
}

/** Delete, or delete and close the gap behind it. Ripple is destructive in a
 *  way the timeline used to avoid on purpose, because until now there was no
 *  way back from it. */
async function deleteSelected(ripple) {
  const clipId = liveSelection();
  if (!clipId) return;
  // edit() answers null when the edit was refused. The empty array a delete
  // gets back is a success that made no clips, and it is not null.
  const done = await edit({ op: ripple ? 'rippleDelete' : 'removeClip', clipId });
  if (done) state.selectedClipId = null;
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

/** One addClip per asset, all asking for the same frame.
 *
 *  They come out end to end rather than on top of each other because a clip
 *  never overlaps another one: the second lands after the first, the third
 *  after the second. The page does not have to work out where any of them go,
 *  which is exactly the arithmetic it no longer owns. */
function dropCommands(trackId, assets, atFrame) {
  const track = L.findTrack(state.project, trackId);
  if (!track) return [];
  return assets
    .filter((asset) => L.canAccept(track, asset))
    .map((asset) => ({ op: 'addClip', trackId, assetId: asset.id, start: atFrame }));
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

async function endAssetDrag(event) {
  const current = clearAssetDrag();
  if (!current) return;

  const lane = laneAtPoint(event.clientX, event.clientY);
  if (!lane) return;
  const at = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
  const made = await edit(...dropCommands(lane.dataset.trackId, [current.asset], at));
  if (made && made.length) selectClip(made[made.length - 1]);
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

  const found = await probePaths(payload.paths || []);
  if (!found.length) return;
  // The import and the clips it turns into are one thing the user did, so they
  // go over as one transaction and come back on one press of undo.
  const at = L.snapTime(state.project, frameAtClientX(x), snapTolerance());
  const made = await edit(
    { op: 'addAssets', assets: found },
    ...(lane ? dropCommands(lane.dataset.trackId, found, at) : [])
  );
  if (made && made.length) selectClip(made[made.length - 1]);
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
  adopt(doc);
  state.path = path || null;
  state.savedRevision = doc.revision;
  state.selectedClipId = null;
  state.selectedAssetId = null;
  preview.clear();
  preview.showTimeline();
  setPreviewSource('timeline');
  for (const asset of state.project.assets) hydrateDuration(asset);
  refresh();
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
    // What is on disk is this revision, which is what makes the dot go away —
    // and come back the moment anything else is done.
    state.savedRevision = state.doc.revision;
    updateTitle();
    return true;
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
    return false;
  }
}

async function closeProject() {
  if (!(await confirmDiscard('Close this project'))) return;
  loadDocument(await window.api.newDocument(), null);
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
  undo: undoEdit,
  redo: redoEdit,
  split: splitAtPlayhead,
  'delete-clip': () => deleteSelected(false),
  'ripple-delete': () => deleteSelected(true),
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
      if (state.selectedAssetId === remove.dataset.remove) state.selectedAssetId = null;
      edit({ op: 'removeAsset', assetId: remove.dataset.remove });
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
  dom.btnDelete.addEventListener('click', () => deleteSelected(false));
  dom.btnRipple.addEventListener('click', () => deleteSelected(true));
  dom.btnAddVideo.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'video' }));
  dom.btnAddAudio.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'audio' }));

  dom.heads.addEventListener('click', (event) => {
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    const track = L.findTrack(state.project, button.closest('.head').dataset.trackId);
    if (!track) return;
    const flag = button.dataset.toggle;
    edit({ op: 'setTrackFlags', trackId: track.id, [flag]: !track[flag] });
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
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoEdit();
      else undoEdit();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      // Shift closes the gap behind it, which is the destructive one and the
      // reason it is not the plain key.
      deleteSelected(event.shiftKey);
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

  // The app already has an empty document open, made from these same defaults
  // when the window came up.
  adopt(await window.api.editState());
  state.savedRevision = state.doc.revision;
  applySettings(state.settings);
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
    if (isDirty()) {
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
