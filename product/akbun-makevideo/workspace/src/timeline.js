'use strict';

// The pure editing model: the project, its tracks and the arithmetic of moving,
// trimming, splitting and snapping clips. No DOM access, so node tests all of
// it without an app binary.
//
// This lives in the page rather than in Rust because a drag has to answer on
// the next frame; a round trip per mouse move would not keep up. Rust reads the
// same shape back through serde for the render, so the two halves agree without
// either reimplementing the other. See wiki/architecture.md.

const MAX_TRACKS_PER_KIND = 4;
// Below this a clip is a sliver nobody can grab again, so trims and splits
// refuse to produce one.
const MIN_CLIP_MS = 100;
// A still has no length of its own, so it gets one when it lands on a track.
const DEFAULT_IMAGE_MS = 5000;

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}${sequence}`;
}

function clipDuration(clip) {
  return Math.max(0, clip.outMs - clip.inMs);
}

function clipEnd(clip) {
  return clip.startMs + clipDuration(clip);
}

function defaultSettings() {
  return { width: 1920, height: 1080, fps: 30 };
}

function createTrack(kind, name) {
  return { id: nextId('t'), kind, name, clips: [], muted: false, hidden: false };
}

// V1 and A1 to start with. More are added from the timeline header, up to four
// of each.
function createProject(settings) {
  return {
    version: 1,
    settings: Object.assign(defaultSettings(), settings || {}),
    assets: [],
    tracks: [createTrack('video', 'V1'), createTrack('audio', 'A1')],
  };
}

function tracksOf(project, kind) {
  return project.tracks.filter((track) => track.kind === kind);
}

function addTrack(project, kind) {
  const existing = tracksOf(project, kind);
  if (existing.length >= MAX_TRACKS_PER_KIND) return null;
  const track = createTrack(kind, `${kind === 'video' ? 'V' : 'A'}${existing.length + 1}`);
  project.tracks.push(track);
  return track;
}

// The last track of a kind is the only one that can go, so the remaining names
// stay in step with their numbers.
function removeTrack(project, trackId) {
  const track = findTrack(project, trackId);
  if (!track) return false;
  const siblings = tracksOf(project, track.kind);
  if (siblings.length <= 1) return false;
  if (siblings[siblings.length - 1].id !== trackId) return false;
  project.tracks = project.tracks.filter((candidate) => candidate.id !== trackId);
  return true;
}

function findTrack(project, trackId) {
  return project.tracks.find((track) => track.id === trackId) || null;
}

function findClip(project, clipId) {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

function findAsset(project, assetId) {
  return project.assets.find((asset) => asset.id === assetId) || null;
}

// Assets are identified by a hash of their path, so importing the same file
// twice updates the row instead of adding a second one.
function addAssets(project, assets) {
  const added = [];
  for (const asset of assets) {
    const index = project.assets.findIndex((candidate) => candidate.id === asset.id);
    if (index >= 0) project.assets[index] = Object.assign({}, project.assets[index], asset);
    else {
      project.assets.push(asset);
      added.push(asset);
    }
  }
  return added;
}

// Removing an asset has to take its clips with it, or the render fails on a
// clip pointing at nothing.
function removeAsset(project, assetId) {
  project.assets = project.assets.filter((asset) => asset.id !== assetId);
  for (const track of project.tracks) {
    track.clips = track.clips.filter((clip) => clip.assetId !== assetId);
  }
}

/** What a track will take. A video with sound can go on an audio track, which
 *  is how you use the sound of a take without its picture. */
function canAccept(track, asset) {
  if (!asset) return false;
  if (track.kind === 'video') return asset.kind === 'video' || asset.kind === 'image';
  return asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio);
}

function assetLengthMs(asset) {
  if (asset.kind === 'image') return DEFAULT_IMAGE_MS;
  // 0 means ffprobe was not there to ask. The page patches it in once the
  // media element reports its own duration.
  return asset.durationMs > 0 ? asset.durationMs : DEFAULT_IMAGE_MS;
}

/** The first position at or after `wantedMs` where a clip of `durationMs` fits
 *  without overlapping. Clips never overlap on a track: two pictures in the
 *  same place at the same time is a question the timeline cannot answer, and
 *  pushing right is the answer every editor gives. */
function freeStart(track, wantedMs, durationMs, ignoreClipId) {
  const others = track.clips.filter((clip) => clip.id !== ignoreClipId);
  let start = Math.max(0, Math.round(wantedMs));
  let moved = true;
  while (moved) {
    moved = false;
    for (const other of others) {
      if (start < clipEnd(other) && other.startMs < start + durationMs) {
        start = clipEnd(other);
        moved = true;
      }
    }
  }
  return start;
}

function sortClips(track) {
  track.clips.sort((a, b) => a.startMs - b.startMs);
}

/** Drop an asset onto a track. Returns the new clip, or null when the track
 *  cannot take that kind of asset. */
function addClip(project, trackId, assetId, startMs) {
  const track = findTrack(project, trackId);
  const asset = findAsset(project, assetId);
  if (!track || !canAccept(track, asset)) return null;
  const duration = assetLengthMs(asset);
  const clip = {
    id: nextId('c'),
    assetId,
    startMs: freeStart(track, startMs, duration, null),
    inMs: 0,
    outMs: duration,
    volume: 1,
    opacity: 1,
  };
  track.clips.push(clip);
  sortClips(track);
  return clip;
}

/** Move a clip inside its track or to another one. Returns the clip, or null
 *  when the target track will not take it. */
function moveClip(project, clipId, targetTrackId, startMs) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const target = findTrack(project, targetTrackId);
  const asset = findAsset(project, found.clip.assetId);
  if (!target || !canAccept(target, asset)) return null;

  const duration = clipDuration(found.clip);
  if (target.id !== found.track.id) {
    found.track.clips = found.track.clips.filter((clip) => clip.id !== clipId);
    target.clips.push(found.clip);
  }
  found.clip.startMs = freeStart(target, startMs, duration, clipId);
  sortClips(target);
  return found.clip;
}

/** Drag a clip edge. `edge` is 'start' or 'end'. The start edge moves the in
 *  point with it, so the frame under the cursor is the frame that stays. */
function trimClip(project, clipId, edge, timeMs) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const asset = findAsset(project, clip.assetId);
  const sourceLimit = asset && asset.kind !== 'image' && asset.durationMs > 0 ? asset.durationMs : Infinity;

  if (edge === 'start') {
    const earliest = clip.startMs - clip.inMs;
    const latest = clipEnd(clip) - MIN_CLIP_MS;
    const at = Math.min(Math.max(Math.round(timeMs), Math.max(0, earliest)), latest);
    clip.inMs += at - clip.startMs;
    clip.startMs = at;
  } else {
    const earliest = clip.startMs + MIN_CLIP_MS;
    const latest = sourceLimit === Infinity ? Infinity : clip.startMs + (sourceLimit - clip.inMs);
    const at = Math.min(Math.max(Math.round(timeMs), earliest), latest);
    clip.outMs = clip.inMs + (at - clip.startMs);
  }
  sortClips(found.track);
  return clip;
}

/** Cut at the playhead. With a clip selected only that clip is cut; with
 *  nothing selected every clip the playhead crosses is, which is what the
 *  toolbar button and Cmd+B do. Returns the new right hand clips. */
function splitAt(project, timeMs, onlyClipId) {
  const at = Math.round(timeMs);
  const created = [];
  for (const track of project.tracks) {
    for (const clip of track.clips.slice()) {
      if (onlyClipId && clip.id !== onlyClipId) continue;
      if (at <= clip.startMs || at >= clipEnd(clip)) continue;
      const offset = at - clip.startMs;
      if (offset < MIN_CLIP_MS || clipDuration(clip) - offset < MIN_CLIP_MS) continue;
      const right = {
        id: nextId('c'),
        assetId: clip.assetId,
        startMs: at,
        inMs: clip.inMs + offset,
        outMs: clip.outMs,
        volume: clip.volume,
        opacity: clip.opacity,
      };
      clip.outMs = clip.inMs + offset;
      track.clips.push(right);
      created.push(right);
    }
    sortClips(track);
  }
  return created;
}

function removeClip(project, clipId) {
  const found = findClip(project, clipId);
  if (!found) return false;
  found.track.clips = found.track.clips.filter((clip) => clip.id !== clipId);
  return true;
}

/** How long the timeline is. A track that contributes nothing does not extend
 *  it, so the render and the ruler agree with each other. */
function projectDurationMs(project) {
  let end = 0;
  for (const track of project.tracks) {
    if (track.hidden || (track.kind === 'audio' && track.muted)) continue;
    for (const clip of track.clips) {
      if (clipDuration(clip) > 0) end = Math.max(end, clipEnd(clip));
    }
  }
  return end;
}

/** What is under the playhead, bottom track first. `sourceMs` is where inside
 *  the asset that instant falls, which is what the preview seeks to. */
function clipsAt(project, timeMs) {
  const active = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (timeMs < clip.startMs || timeMs >= clipEnd(clip)) continue;
      active.push({
        track,
        clip,
        sourceMs: clip.inMs + (timeMs - clip.startMs),
      });
    }
  }
  return active;
}

/** Everything worth snapping to: zero, both edges of every other clip, and
 *  whatever extra times the caller passes in (the playhead, usually). */
function snapTargets(project, exceptClipId, extra) {
  const targets = [0];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === exceptClipId) continue;
      targets.push(clip.startMs, clipEnd(clip));
    }
  }
  for (const time of extra || []) {
    if (Number.isFinite(time)) targets.push(Math.round(time));
  }
  return targets;
}

/** The nearest target within `toleranceMs`, or the time unchanged. This is the
 *  magnet button; passing tolerance 0 turns it off. */
function snapTime(project, timeMs, toleranceMs, options) {
  const settings = options || {};
  if (!(toleranceMs > 0)) return Math.max(0, Math.round(timeMs));
  let best = Math.max(0, Math.round(timeMs));
  let bestDistance = toleranceMs + 1;
  for (const target of snapTargets(project, settings.exceptClipId, settings.extra)) {
    const distance = Math.abs(target - timeMs);
    if (distance <= toleranceMs && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return Math.max(0, best);
}

/** Snapping a clip means snapping whichever of its two edges lands closest, so
 *  a clip dragged by its tail still butts up against the one before it. */
function snapClipStart(project, startMs, durationMs, toleranceMs, options) {
  const settings = options || {};
  if (!(toleranceMs > 0)) return Math.max(0, Math.round(startMs));
  const targets = snapTargets(project, settings.exceptClipId, settings.extra);
  let best = Math.max(0, Math.round(startMs));
  let bestDistance = toleranceMs + 1;
  for (const target of targets) {
    for (const candidate of [target, target - durationMs]) {
      const distance = Math.abs(candidate - startMs);
      if (candidate >= 0 && distance <= toleranceMs && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return Math.max(0, best);
}

/** A project read back from disk. Ids in the file were made by an earlier run
 *  of this same counter, so the counter is pushed past them; otherwise the
 *  first clip added after an open would collide with one already there. */
function normalize(project) {
  const restored = Object.assign(
    { version: 1, settings: defaultSettings(), assets: [], tracks: [] },
    project || {}
  );
  restored.settings = Object.assign(defaultSettings(), restored.settings || {});
  if (!restored.tracks.length) {
    restored.tracks = [createTrack('video', 'V1'), createTrack('audio', 'A1')];
  }
  let highest = 0;
  for (const track of restored.tracks) {
    track.clips = track.clips || [];
    track.muted = Boolean(track.muted);
    track.hidden = Boolean(track.hidden);
    for (const clip of track.clips) {
      clip.volume = typeof clip.volume === 'number' ? clip.volume : 1;
      clip.opacity = typeof clip.opacity === 'number' ? clip.opacity : 1;
    }
    sortClips(track);
    for (const id of [track.id, ...track.clips.map((clip) => clip.id)]) {
      const match = /^[a-z]+(\d+)$/.exec(String(id));
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  }
  sequence = Math.max(sequence, highest);
  return restored;
}

// --- the timeline ruler ----------------------------------------------------

function msToPx(ms, pxPerSecond) {
  return (ms / 1000) * pxPerSecond;
}

function pxToMs(px, pxPerSecond) {
  return (px / pxPerSecond) * 1000;
}

/** h:mm:ss.cc, which is short enough for the transport and still exact enough
 *  to see a two frame trim. */
function formatTime(ms) {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const centis = Math.floor((clamped % 1000) / 10);
  const pad = (value) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/** Ruler tick spacing that stays readable at every zoom, so the labels never
 *  collide and never thin out to two on the whole timeline. */
function tickStepMs(pxPerSecond) {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
  for (const step of steps) {
    if (msToPx(step, pxPerSecond) >= 70) return step;
  }
  return steps[steps.length - 1];
}

const exported = {
  MAX_TRACKS_PER_KIND,
  MIN_CLIP_MS,
  DEFAULT_IMAGE_MS,
  createProject,
  createTrack,
  addTrack,
  removeTrack,
  tracksOf,
  findTrack,
  findClip,
  findAsset,
  addAssets,
  removeAsset,
  canAccept,
  assetLengthMs,
  clipDuration,
  clipEnd,
  freeStart,
  addClip,
  moveClip,
  trimClip,
  splitAt,
  removeClip,
  projectDurationMs,
  clipsAt,
  snapTargets,
  snapTime,
  snapClipStart,
  normalize,
  msToPx,
  pxToMs,
  formatTime,
  tickStepMs,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.timelineLib = exported;
}
