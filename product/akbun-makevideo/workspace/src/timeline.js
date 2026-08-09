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
// Below this a clip is a sliver nobody can grab again. The same number lives in
// the edit crate, which is the one that enforces it; this copy is what stops a
// trim from *looking* as though it went further than it will be allowed to.
const MIN_CLIP_SECONDS = 0.1;

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
      active.push({
        track,
        clip,
        sourceFrame: clip.in + (at - clip.start),
      });
    }
  }
  return active;
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
    version: 2,
    settings: { width: 1920, height: 1080, rate: T.fps(30) },
    assets: [],
    tracks: [],
    markers: [],
  };
}

const exported = {
  MAX_TRACKS_PER_KIND,
  MIN_CLIP_SECONDS,
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
  editPoints,
  previousEditPoint,
  nextEditPoint,
  clipsAt,
  gapAt,
  rateOf,
  snapTargets,
  snapTime,
  snapClipStart,
  framesToPx,
  pxToFrames,
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
