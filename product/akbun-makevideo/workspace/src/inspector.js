'use strict';

(function () {

function findClip(project, clipId) {
  for (const track of (project && project.tracks) || []) {
    const clip = (track.clips || []).find((entry) => entry.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

function findAsset(project, assetId) {
  return ((project && project.assets) || []).find((asset) => asset.id === assetId) || null;
}

function clipTargets(project, clipId) {
  const selected = findClip(project, clipId);
  if (!selected) return null;
  const linked = selected.clip.linkGroup
    ? project.tracks.flatMap((track) => (track.clips || [])
      .filter((clip) => clip.linkGroup === selected.clip.linkGroup)
      .map((clip) => ({ track, clip })))
    : [selected];
  const video = linked.find((entry) => entry.track.kind === 'video') || null;
  let audio = linked.find((entry) => entry.track.kind === 'audio') || null;
  if (!audio && video) {
    const asset = findAsset(project, video.clip.assetId);
    if (asset && asset.kind === 'video' && asset.hasAudio) audio = video;
  }
  return { selected, video, audio };
}

function activeTab(targets, preferred) {
  if (!targets) return null;
  if (preferred === 'video' && targets.video) return 'video';
  if (preferred === 'audio' && targets.audio) return 'audio';
  const selectedKind = targets.selected.track.kind;
  if (selectedKind === 'video' && targets.video) return 'video';
  if (selectedKind === 'audio' && targets.audio) return 'audio';
  return targets.video ? 'video' : targets.audio ? 'audio' : null;
}

/** The property groups a selection has, in the order the tab bar shows them. A
 *  layer has one; a clip has a Video and an Audio group when it carries them. */
function availableTabs({ item, targets, transition }) {
  if (item) return ['video'];
  if (!targets) return [];
  const tabs = [];
  if (targets.video) tabs.push('video');
  if (targets.audio) tabs.push('audio');
  if (transition) tabs.push('transition');
  return tabs;
}

function inspectorTitle({ item, subtitle, targets }) {
  if (item) {
    const kind = item.content && item.content.kind;
    if (kind === 'text') return subtitle ? 'Subtitle' : 'Text';
    if (kind === 'shape') return 'Shape';
    if (kind === 'videoOverlay') return 'Picture in Picture';
    return 'Inspector';
  }
  if (!targets) return 'Inspector';
  return targets.selected.track.kind === 'audio' ? 'Audio clip' : 'Video clip';
}

const exported = { clipTargets, activeTab, availableTabs, inspectorTitle };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.inspectorLib = exported;
}
})();
