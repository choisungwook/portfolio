'use strict';

(function () {

const T =
  typeof module !== 'undefined' && module.exports ? require('./time.js') : globalThis.timeLib;

function sourceLimitFrames(asset, rate) {
  if (!asset) return 0;
  if (asset.kind === 'image' || !(asset.durationMs > 0)) {
    return Math.max(1, Math.round(4 * T.rateToNumber(rate)));
  }
  return Math.max(1, T.framesFromMillis(asset.durationMs, rate));
}

function selectionFor(asset, rate) {
  return { inPoint: 0, outPoint: sourceLimitFrames(asset, rate) };
}

function markIn(selection, frame) {
  const outPoint = Math.max(1, Math.round(selection.outPoint));
  return {
    inPoint: Math.max(0, Math.min(Math.round(frame), outPoint - 1)),
    outPoint,
  };
}

function markOut(selection, frame, limit) {
  const inPoint = Math.max(0, Math.round(selection.inPoint));
  return {
    inPoint,
    outPoint: Math.max(inPoint + 1, Math.min(Math.round(frame), Math.max(1, limit))),
  };
}

function targetTrack(project, kind, preferredId) {
  const preferred = project.tracks.find(
    (track) => track.id === preferredId && track.kind === kind
  );
  return preferred || project.tracks.find((track) => track.kind === kind) || null;
}

function commandFor(mode, project, asset, selection, options) {
  if (!['insert', 'overwrite', 'append'].includes(mode)) return null;
  if (!project || !asset || !selection) return null;
  const settings = options || {};
  const wantsVideo = Boolean(settings.video) && (asset.kind === 'video' || asset.kind === 'image');
  const wantsAudio = Boolean(settings.audio) &&
    (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio));
  const video = wantsVideo ? targetTrack(project, 'video', settings.targetTrackId) : null;
  const audio = wantsAudio ? targetTrack(project, 'audio', settings.targetTrackId) : null;
  if ((wantsVideo && !video) || (wantsAudio && !audio) || (!wantsVideo && !wantsAudio)) return null;
  const command = {
    op: `${mode}Source`,
    assetId: asset.id,
    videoTrackId: video ? video.id : null,
    audioTrackId: audio ? audio.id : null,
    inPoint: Math.max(0, Math.round(selection.inPoint)),
    outPoint: Math.max(1, Math.round(selection.outPoint)),
  };
  if (mode !== 'append') command.start = Math.max(0, Math.round(settings.start || 0));
  if (mode === 'insert') command.rippleAllTracks = Boolean(settings.rippleAllTracks);
  return command;
}

const exported = {
  sourceLimitFrames,
  selectionFor,
  markIn,
  markOut,
  targetTrack,
  commandFor,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.sourceLib = exported;
}
})();
