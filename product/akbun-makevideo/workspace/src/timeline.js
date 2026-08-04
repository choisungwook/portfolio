'use strict';

// The pure editing model: the project, its tracks and the arithmetic of moving,
// trimming, splitting and snapping clips. No DOM access, so node tests all of
// it without an app binary.
//
// This lives in the page rather than in Rust because a drag has to answer on
// the next frame; a round trip per mouse move would not keep up. Rust reads the
// same shape back through serde for the render, so the two halves agree without
// either reimplementing the other. See wiki/architecture/timeline.md.
//
// Every time here is a frame index on the project rate — `start`, `in` and
// `out` on a clip, and everything this file takes and returns. Milliseconds
// only appear where something outside hands them over, and they are converted
// at that boundary through time.js.

const T =
  typeof module !== 'undefined' && module.exports ? require('./time.js') : globalThis.timeLib;

const MAX_TRACKS_PER_KIND = 4;
// Below this a clip is a sliver nobody can grab again, so trims and splits
// refuse to produce one. A tenth of a second is between two and six frames
// depending on the rate, which is why it is stated in seconds and converted.
const MIN_CLIP_SECONDS = 0.1;
// A still has no length of its own, so it gets one when it lands on a track.
const DEFAULT_IMAGE_SECONDS = 5;
// What the format is called. Version 1 measured everything in milliseconds;
// `normalize` converts one of those on the way in.
const FORMAT_VERSION = 2;

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}${sequence}`;
}

/** Rounded up, so the constant above is a floor rather than an average: at
 *  23.976 a tenth of a second is 2.4 frames, and rounding to 2 would make the
 *  shortest clip shorter than the length that was decided to be grabbable. */
function minClipFrames(rate) {
  return Math.max(1, Math.ceil(MIN_CLIP_SECONDS * T.rateToNumber(rate)));
}

function clipDuration(clip) {
  return Math.max(0, clip.out - clip.in);
}

function clipEnd(clip) {
  return clip.start + clipDuration(clip);
}

function defaultSettings() {
  return { width: 1920, height: 1080, rate: T.fps(30) };
}

function rateOf(project) {
  return (project && project.settings && project.settings.rate) || T.fps(30);
}

function createTrack(kind, name) {
  return { id: nextId('t'), kind, name, clips: [], muted: false, hidden: false };
}

// V1 and A1 to start with. More are added from the timeline header, up to four
// of each.
function createProject(settings) {
  return {
    version: FORMAT_VERSION,
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

/** How many frames of the project an asset lasts. ffprobe reports a file's
 *  length in milliseconds, which is a fact about the file rather than about the
 *  timeline, so this is where it becomes frames. */
function assetLengthFrames(asset, rate) {
  const fallback = Math.round(DEFAULT_IMAGE_SECONDS * T.rateToNumber(rate));
  if (asset.kind === 'image') return fallback;
  // 0 means ffprobe was not there to ask. The page patches it in once the
  // media element reports its own duration.
  return asset.durationMs > 0 ? T.framesFromMillis(asset.durationMs, rate) : fallback;
}

/** The first position at or after `wanted` where a clip of `duration` frames
 *  fits without overlapping. Clips never overlap on a track: two pictures in
 *  the same place at the same time is a question the timeline cannot answer,
 *  and pushing right is the answer every editor gives. */
function freeStart(track, wanted, duration, ignoreClipId) {
  const others = track.clips.filter((clip) => clip.id !== ignoreClipId);
  let start = Math.max(0, Math.round(wanted));
  let moved = true;
  while (moved) {
    moved = false;
    for (const other of others) {
      if (start < clipEnd(other) && other.start < start + duration) {
        start = clipEnd(other);
        moved = true;
      }
    }
  }
  return start;
}

function sortClips(track) {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Drop an asset onto a track. Returns the new clip, or null when the track
 *  cannot take that kind of asset. */
function addClip(project, trackId, assetId, start) {
  const track = findTrack(project, trackId);
  const asset = findAsset(project, assetId);
  if (!track || !canAccept(track, asset)) return null;
  const duration = assetLengthFrames(asset, rateOf(project));
  const clip = {
    id: nextId('c'),
    assetId,
    start: freeStart(track, start, duration, null),
    in: 0,
    out: duration,
    volume: 1,
    opacity: 1,
  };
  track.clips.push(clip);
  sortClips(track);
  return clip;
}

/** Move a clip inside its track or to another one. Returns the clip, or null
 *  when the target track will not take it. */
function moveClip(project, clipId, targetTrackId, start) {
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
  found.clip.start = freeStart(target, start, duration, clipId);
  sortClips(target);
  return found.clip;
}

/** Drag a clip edge. `edge` is 'start' or 'end'. The start edge moves the in
 *  point with it, so the frame under the cursor is the frame that stays. */
function trimClip(project, clipId, edge, frame) {
  const found = findClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const rate = rateOf(project);
  const shortest = minClipFrames(rate);
  const asset = findAsset(project, clip.assetId);
  const sourceLimit =
    asset && asset.kind !== 'image' && asset.durationMs > 0
      ? T.framesFromMillis(asset.durationMs, rate)
      : Infinity;

  if (edge === 'start') {
    const earliest = clip.start - clip.in;
    const latest = clipEnd(clip) - shortest;
    const at = Math.min(Math.max(Math.round(frame), Math.max(0, earliest)), latest);
    clip.in += at - clip.start;
    clip.start = at;
  } else {
    const earliest = clip.start + shortest;
    const latest = sourceLimit === Infinity ? Infinity : clip.start + (sourceLimit - clip.in);
    const at = Math.min(Math.max(Math.round(frame), earliest), latest);
    clip.out = clip.in + (at - clip.start);
  }
  sortClips(found.track);
  return clip;
}

/** Cut at the playhead. With a clip selected only that clip is cut; with
 *  nothing selected every clip the playhead crosses is, which is what the
 *  toolbar button and Cmd+B do. Returns the new right hand clips. */
function splitAt(project, frame, onlyClipId) {
  const at = Math.round(frame);
  const shortest = minClipFrames(rateOf(project));
  const created = [];
  for (const track of project.tracks) {
    for (const clip of track.clips.slice()) {
      if (onlyClipId && clip.id !== onlyClipId) continue;
      if (at <= clip.start || at >= clipEnd(clip)) continue;
      const offset = at - clip.start;
      if (offset < shortest || clipDuration(clip) - offset < shortest) continue;
      const right = {
        id: nextId('c'),
        assetId: clip.assetId,
        start: at,
        in: clip.in + offset,
        out: clip.out,
        volume: clip.volume,
        opacity: clip.opacity,
      };
      clip.out = clip.in + offset;
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

/** How long the timeline is, in frames. A track that contributes nothing does
 *  not extend it, so the render and the ruler agree with each other. */
function projectDurationFrames(project) {
  let end = 0;
  for (const track of project.tracks) {
    if (track.hidden || (track.kind === 'audio' && track.muted)) continue;
    for (const clip of track.clips) {
      if (clipDuration(clip) > 0) end = Math.max(end, clipEnd(clip));
    }
  }
  return end;
}

/** What is under the playhead, bottom track first. `sourceFrame` is which frame
 *  of the asset that instant is, which is what the preview seeks to. */
function clipsAt(project, frame) {
  const at = Math.floor(frame);
  const active = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (at < clip.start || at >= clipEnd(clip)) continue;
      active.push({
        track,
        clip,
        sourceFrame: clip.in + (at - clip.start),
      });
    }
  }
  return active;
}

/** Everything worth snapping to: zero, both edges of every other clip, and
 *  whatever extra frames the caller passes in (the playhead, usually). */
function snapTargets(project, exceptClipId, extra) {
  const targets = [0];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === exceptClipId) continue;
      targets.push(clip.start, clipEnd(clip));
    }
  }
  for (const frame of extra || []) {
    if (Number.isFinite(frame)) targets.push(Math.round(frame));
  }
  return targets;
}

/** The nearest target within `tolerance` frames, or the frame unchanged. This
 *  is the magnet button; passing tolerance 0 turns it off. */
function snapTime(project, frame, tolerance, options) {
  const settings = options || {};
  if (!(tolerance > 0)) return Math.max(0, Math.round(frame));
  let best = Math.max(0, Math.round(frame));
  let bestDistance = tolerance + 1;
  for (const target of snapTargets(project, settings.exceptClipId, settings.extra)) {
    const distance = Math.abs(target - frame);
    if (distance <= tolerance && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return Math.max(0, best);
}

/** Snapping a clip means snapping whichever of its two edges lands closest, so
 *  a clip dragged by its tail still butts up against the one before it. */
function snapClipStart(project, start, duration, tolerance, options) {
  const settings = options || {};
  if (!(tolerance > 0)) return Math.max(0, Math.round(start));
  const targets = snapTargets(project, settings.exceptClipId, settings.extra);
  let best = Math.max(0, Math.round(start));
  let bestDistance = tolerance + 1;
  for (const target of targets) {
    for (const candidate of [target, target - duration]) {
      const distance = Math.abs(candidate - start);
      if (candidate >= 0 && distance <= tolerance && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return Math.max(0, best);
}

/** Change the timebase and carry the edit with it, so a project cut at 30 and
 *  then set to 29.97 keeps every clip where it was in time rather than where it
 *  was in frame numbers. Rounding is to the nearest frame of the new rate,
 *  which is the closest the new rate can hold. */
function retime(project, nextRate) {
  const from = rateOf(project);
  const to = T.rate(nextRate.num, nextRate.den);
  project.settings.rate = to;
  if (T.sameRate(from, to)) return project;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      clip.start = T.rescale(clip.start, from, to);
      clip.in = T.rescale(clip.in, from, to);
      clip.out = T.rescale(clip.out, from, to);
    }
    sortClips(track);
  }
  return project;
}

/** A project read back from disk, whatever version wrote it.
 *
 *  A version 1 file holds milliseconds and an integer fps; every time in it is
 *  converted here, once, so nothing downstream has to remember which format it
 *  came from. The two formats use different keys, so which one a clip is in is
 *  read off the clip rather than trusted from the header.
 *
 *  Ids in the file were made by an earlier run of this same counter, so the
 *  counter is pushed past them; otherwise the first clip added after an open
 *  would collide with one already there. */
function normalize(project) {
  const source = project || {};
  const settings = source.settings || {};
  const defaults = defaultSettings();
  const rate = settings.rate
    ? T.rate(settings.rate.num, settings.rate.den)
    : settings.fps !== undefined
      ? T.nearestRate(settings.fps)
      : defaults.rate;

  const restored = {
    version: FORMAT_VERSION,
    settings: {
      width: settings.width || defaults.width,
      height: settings.height || defaults.height,
      rate,
    },
    assets: source.assets || [],
    tracks: source.tracks || [],
  };
  if (!restored.tracks.length) {
    restored.tracks = [createTrack('video', 'V1'), createTrack('audio', 'A1')];
  }

  const frames = (value, millis) => {
    if (typeof value === 'number') return value;
    return T.framesFromMillis(typeof millis === 'number' ? millis : 0, rate);
  };

  let highest = 0;
  for (const track of restored.tracks) {
    track.muted = Boolean(track.muted);
    track.hidden = Boolean(track.hidden);
    // Rebuilt rather than patched, so a millisecond key cannot survive into the
    // next save alongside the frame count that replaced it.
    track.clips = (track.clips || []).map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      start: frames(clip.start, clip.startMs),
      in: frames(clip.in, clip.inMs),
      out: frames(clip.out, clip.outMs),
      volume: typeof clip.volume === 'number' ? clip.volume : 1,
      opacity: typeof clip.opacity === 'number' ? clip.opacity : 1,
    }));
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

function framesToPx(frames, rate, pxPerSecond) {
  return T.framesToSeconds(frames, rate) * pxPerSecond;
}

function pxToFrames(px, rate, pxPerSecond) {
  return T.secondsToFrames(px / pxPerSecond, rate);
}

/** h:mm:ss:ff. The frames field is what makes a two frame trim visible, which
 *  a fraction of a second never was. */
function formatTimecode(frames, rate) {
  return T.formatTimecode(frames, rate);
}

/** The same clock with the leading hour and the trailing frames dropped when
 *  they are zero, because a ruler tick has no room for either. */
function formatRulerLabel(frames, rate) {
  const [hours, minutes, seconds, frameField] = formatTimecode(frames, rate).split(':');
  const head = hours === '0' ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
  return frameField === '00' ? head : `${head}:${frameField}`;
}

/** Ruler tick spacing that stays readable at every zoom, so the labels never
 *  collide and never thin out to two on the whole timeline. Stated in seconds
 *  and converted, because the useful steps are wall clock ones. */
function tickStepFrames(pxPerSecond, rate) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const chosen = steps.find((seconds) => seconds * pxPerSecond >= 70) || steps[steps.length - 1];
  return Math.max(1, Math.round(chosen * T.rateToNumber(rate)));
}

const exported = {
  FORMAT_VERSION,
  MAX_TRACKS_PER_KIND,
  MIN_CLIP_SECONDS,
  DEFAULT_IMAGE_SECONDS,
  minClipFrames,
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
  assetLengthFrames,
  clipDuration,
  clipEnd,
  freeStart,
  addClip,
  moveClip,
  trimClip,
  splitAt,
  removeClip,
  projectDurationFrames,
  clipsAt,
  rateOf,
  retime,
  snapTargets,
  snapTime,
  snapClipStart,
  normalize,
  framesToPx,
  pxToFrames,
  formatTimecode,
  formatRulerLabel,
  tickStepFrames,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.timelineLib = exported;
}
