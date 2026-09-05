'use strict';

(function () {

// What the page needs in order to draw a project and to answer a pointer.
//
// This file used to own the project. It does not any more: the model lives in
// Rust, in the makevideo-edit crate, and the page sends a command and redraws
// from the state that comes back. See adr/2026-08-edit-model-in-rust.md.
//
// So nothing here writes. What is left is the arithmetic a redraw and a drag
// need between frames — where a clip sits in pixels, what is under the
// playhead, which edge the magnet would take — and it is left here because a
// round trip cannot answer any of it in time. A drag has to look right on the
// next frame; only the result of the drag has to be true.
//
// The overlap between this and the Rust model is deliberate and bounded: the
// page predicts, Rust decides, and where the two disagree it is the page that
// is wrong for one frame and then redraws. Nothing here may touch the DOM or
// window.api, which is what keeps it under `node --test`.
//
// Every time here is a frame index on the project rate.

const T =
  typeof module !== 'undefined' && module.exports ? require('./time.js') : globalThis.timeLib;

const MAX_TRACKS_PER_KIND = 4;
const MAX_REALTIME_VIDEO_SOURCES = 4;
// Below this a clip is a sliver nobody can grab again. The same number lives in
// the edit crate, which is the one that enforces it; this copy is what stops a
// trim from *looking* as though it went further than it will be allowed to.
const MIN_CLIP_SECONDS = 0.1;
// How long a new text or shape layer runs before it is trimmed to taste.
const DEFAULT_VISUAL_ITEM_SECONDS = 4;

/** The default length of a new text or shape layer, in frames of `rate`. */
function defaultVisualItemFrames(rate) {
  return Math.max(1, Math.round(DEFAULT_VISUAL_ITEM_SECONDS * T.rateToNumber(rate)));
}

/** The visual item with this id, with its track, or null. */
function findVisualItem(project, itemId) {
  for (const track of project.tracks) {
    const item = (track.visualItems || []).find((entry) => entry.id === itemId);
    if (item) return { track, item };
  }
  return null;
}

function videoSourceCountAt(project, frame) {
  let count = 0;
  for (const track of project.tracks) {
    if (track.kind !== 'video' || track.hidden) continue;
    count += track.clips.filter((clip) => clip.start <= frame && frame < clipEnd(clip)).length;
    count += (track.visualItems || []).filter((item) =>
      item.content && item.content.kind === 'videoOverlay' &&
      item.start <= frame && frame < item.start + item.duration
    ).length;
  }
  return count;
}

/** Rounded up, so the constant above is a floor rather than an average: at
 *  23.976 a tenth of a second is 2.4 frames, and rounding to 2 would make the
 *  shortest clip shorter than the length that was decided to be grabbable. */
function minClipFrames(rate) {
  return Math.max(1, Math.ceil(MIN_CLIP_SECONDS * T.rateToNumber(rate)));
}

function clipDuration(clip) {
  const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
  const source = Math.max(0, clip.out - clip.in);
  return source > 0 ? Math.max(1, Math.round(source / speed)) : 0;
}

function clipEnd(clip) {
  return clip.start + clipDuration(clip);
}

function rateOf(project) {
  return (project && project.settings && project.settings.rate) || T.fps(30);
}

function tracksOf(project, kind) {
  return project.tracks.filter((track) => track.kind === kind);
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

function findMarker(project, markerId) {
  return (project.markers || []).find((marker) => marker.id === markerId) || null;
}

function linkedClips(project, clipId) {
  const found = findClip(project, clipId);
  if (!found || !found.clip.linkGroup) return found ? [found] : [];
  const linked = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.linkGroup === found.clip.linkGroup) linked.push({ track, clip });
    }
  }
  return linked;
}

function relinkCandidate(project, clipId) {
  const found = findClip(project, clipId);
  if (!found || found.clip.linkGroup) return null;
  for (const track of project.tracks) {
    if (track.kind === found.track.kind) continue;
    const clip = track.clips.find(
      (candidate) =>
        !candidate.linkGroup &&
        candidate.assetId === found.clip.assetId &&
        candidate.start === found.clip.start &&
        candidate.in === found.clip.in &&
        candidate.out === found.clip.out
    );
    if (clip) return { track, clip };
  }
  return null;
}

/** What a track will take. A video with sound can go on an audio track, which
 *  is how you use the sound of a take without its picture. Asked while a clip
 *  is being dragged, to decide whether a lane lights up as a target. */
function canAccept(track, asset) {
  if (!asset) return false;
  if (track.kind === 'video') return asset.kind === 'video' || asset.kind === 'image';
  if (track.kind === 'subtitle') return false;
  return asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio);
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
    for (const item of track.visualItems || []) {
      if (item.duration > 0) end = Math.max(end, item.start + item.duration);
    }
  }
  return end;
}

/** Match a new default project's canvas to its first video.
 *
 *  The long edge stays at the chosen default, so a 4K phone recording does
 *  not silently turn a FHD project into a 4K project. A project whose size was
 *  already changed is left alone. */
function settingsForFirstVideo(project, asset, defaults) {
  if (!project || !project.settings || !asset || asset.kind !== 'video') return null;
  const hasItems = project.tracks.some(
    (track) => track.clips.length > 0 || (track.visualItems || []).length > 0
  );
  if (hasItems || asset.width <= 0 || asset.height <= 0) return null;

  const defaultWidth = Math.max(16, Number(defaults && defaults.width) || 1920);
  const defaultHeight = Math.max(16, Number(defaults && defaults.height) || 1080);
  const { width, height, rate } = project.settings;
  if (width !== defaultWidth || height !== defaultHeight) return null;
  if (width * asset.height === height * asset.width) return null;

  const longEdge = Math.max(width, height);
  const even = (value) => Math.max(16, Math.round(value / 2) * 2);
  const next = asset.width >= asset.height
    ? { width: longEdge, height: even((longEdge * asset.height) / asset.width) }
    : { width: even((longEdge * asset.width) / asset.height), height: longEdge };
  return { ...next, rate };
}

/** Sorted, unique clip boundaries from the target track, or from every enabled
 *  track when none is targeted. */
function editPoints(project, targetTrackId) {
  const points = new Set();
  for (const track of project.tracks) {
    if (track.hidden || (track.kind === 'audio' && track.muted)) continue;
    if (targetTrackId && track.id !== targetTrackId) continue;
    for (const clip of track.clips) {
      if (clipDuration(clip) <= 0) continue;
      points.add(clip.start);
      points.add(clipEnd(clip));
    }
  }
  return [...points].sort((left, right) => left - right);
}

function previousEditPoint(project, frame, targetTrackId) {
  const points = editPoints(project, targetTrackId);
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index] < frame) return points[index];
  }
  return null;
}

function nextEditPoint(project, frame, targetTrackId) {
  return editPoints(project, targetTrackId).find((point) => point > frame) ?? null;
}

/** What is under the playhead, bottom track first. `sourceFrame` is which frame
 *  of the asset that instant is, which is what the preview seeks to. */
function clipsAt(project, frame) {
  const at = Math.floor(frame);
  const active = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (at < clip.start || at >= clipEnd(clip)) continue;
      const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
      active.push({
        track,
        clip,
        sourceFrame: clip.in + Math.floor((at - clip.start) * speed),
      });
    }
  }
  return active;
}

function easedAmount(amount, easing) {
  const value = Math.max(0, Math.min(1, amount));
  if (easing === 'easeIn') return value * value;
  if (easing === 'easeOut') return 1 - (1 - value) * (1 - value);
  if (easing === 'easeInOut') {
    return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
  }
  if (easing === 'hold') return 0;
  return value;
}

function keyframeValue(track, frame, fallback) {
  const keys = track && Array.isArray(track.keyframes) ? track.keyframes : [];
  if (!keys.length) return fallback;
  if (frame <= keys[0].frame) return keys[0].value;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const left = keys[index];
    const right = keys[index + 1];
    if (frame > right.frame) continue;
    if (frame === right.frame) return right.value;
    const amount = easedAmount((frame - left.frame) / Math.max(1, right.frame - left.frame), left.easing);
    return left.value + (right.value - left.value) * amount;
  }
  return keys[keys.length - 1].value;
}

function visualTransformAt(item, frame) {
  const base = item.transform;
  const animation = item.animation || {};
  return {
    x: keyframeValue(animation.x, frame, base.x),
    y: keyframeValue(animation.y, frame, base.y),
    width: keyframeValue(animation.width, frame, base.width),
    height: keyframeValue(animation.height, frame, base.height),
    rotation: keyframeValue(animation.rotation, frame, base.rotation),
    opacity: keyframeValue(animation.opacity, frame, base.opacity),
  };
}

function clipVolumeAt(clip, frame) {
  let volume = Math.max(0, Math.min(1, keyframeValue(clip.volumeKeyframes, frame, clip.volume ?? 1)));
  const offset = frame - clip.start;
  if (clip.fadeIn > 0) volume *= Math.max(0, Math.min(1, offset / clip.fadeIn));
  const remaining = clipEnd(clip) - frame - 1;
  if (clip.fadeOut > 0) volume *= Math.max(0, Math.min(1, remaining / clip.fadeOut));
  return volume;
}

/** The internal empty range under a pointer, or null for a clip, leading
 *  space, trailing space, and a track with fewer than two clips. The page uses
 *  this to decide whether a gap can have a context-menu action; Rust checks
 *  the same two edges before it changes the document. */
function gapAt(track, frame) {
  if (!track) return null;
  const at = Math.max(0, Math.floor(frame));
  const clips = [...track.clips].sort((left, right) => left.start - right.start);
  for (let index = 0; index + 1 < clips.length; index += 1) {
    const start = clipEnd(clips[index]);
    const end = clips[index + 1].start;
    if (start < end && start <= at && at < end) return { start, end };
  }
  return null;
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

// --- the timeline ruler ----------------------------------------------------

function framesToPx(frames, rate, pxPerSecond) {
  return T.framesToSeconds(frames, rate) * pxPerSecond;
}

function pxToFrames(px, rate, pxPerSecond) {
  return T.secondsToFrames(px / pxPerSecond, rate);
}

function laneIndexAtY(bounds, y) {
  return bounds.findIndex((bound) => y >= bound.top && y < bound.bottom);
}

function waveformBucketRange(clip, rate, bucketsPerSecond) {
  const secondsPerFrame = rate.den / rate.num;
  return {
    first: clip.in * secondsPerFrame * bucketsPerSecond,
    last: clip.out * secondsPerFrame * bucketsPerSecond,
  };
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

/** An empty project, for the moment between the page loading and Rust handing
 *  over the real one. Nothing is edited through it. */
function blankProject() {
  return {
    version: 5,
    settings: { width: 1920, height: 1080, rate: T.fps(30) },
    assets: [],
    tracks: [],
    transitions: [],
    markers: [],
  };
}

const exported = {
  MAX_TRACKS_PER_KIND,
  MAX_REALTIME_VIDEO_SOURCES,
  MIN_CLIP_SECONDS,
  DEFAULT_VISUAL_ITEM_SECONDS,
  defaultVisualItemFrames,
  findVisualItem,
  videoSourceCountAt,
  minClipFrames,
  blankProject,
  tracksOf,
  findTrack,
  findClip,
  findAsset,
  findMarker,
  linkedClips,
  relinkCandidate,
  canAccept,
  clipDuration,
  clipEnd,
  projectDurationFrames,
  settingsForFirstVideo,
  editPoints,
  previousEditPoint,
  nextEditPoint,
  clipsAt,
  keyframeValue,
  visualTransformAt,
  clipVolumeAt,
  gapAt,
  rateOf,
  snapTargets,
  snapTime,
  snapClipStart,
  framesToPx,
  pxToFrames,
  laneIndexAtY,
  waveformBucketRange,
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
})();
