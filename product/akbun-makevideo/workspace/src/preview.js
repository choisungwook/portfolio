'use strict';

// The preview: real media elements, stacked and driven by a clock.
//
// There is no compositor here and no decoding in Rust. One element per clip
// sits in the stage, the playhead decides which are visible, and the browser
// does the drawing. That is why the preview is an approximation of the render
// rather than the render itself; see adr/2026-08-preview-in-the-webview.md.

// scale is what the stacked elements are actually laid out at before being
// scaled back up, so a lower setting composites a smaller surface. drift is how
// far an element may run from the playhead before it is seeked back: seeking is
// the expensive part, so a looser tolerance is most of the saving.
const QUALITY = {
  full: { scale: 1, drift: 0.12 },
  half: { scale: 0.5, drift: 0.25 },
  quarter: { scale: 0.25, drift: 0.4 },
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function createPreview(options) {
  const { stage, inner, wrap, exactCanvas, getProject, onTick } = options;
  const L = globalThis.timelineLib;

  const pool = new Map();
  let assetElement = null;
  let assetShown = null;
  let mode = 'timeline';
  let quality = 'half';
  let scrubbing = false;
  let muteWhileScrubbing = true;
  let playing = false;
  let positionMs = 0;
  let clockOrigin = 0;
  let lastReported = -1;

  function settings() {
    const project = getProject();
    return (project && project.settings) || { width: 1920, height: 1080, fps: 30 };
  }

  /** Fit the project shape into the panel, then lay the media out at the
   *  quality scale and scale it back up so it still fills that box. */
  function layout() {
    if (!wrap) return;
    const { width, height } = settings();
    const box = wrap.getBoundingClientRect();
    const availableWidth = Math.max(80, box.width - 28);
    const availableHeight = Math.max(45, box.height - 28);
    const fit = Math.min(availableWidth / width, availableHeight / height);
    const displayWidth = Math.max(80, Math.round(width * fit));
    const displayHeight = Math.max(45, Math.round(height * fit));
    stage.style.width = `${displayWidth}px`;
    stage.style.height = `${displayHeight}px`;
    const factor = QUALITY[quality].scale;
    inner.style.width = `${Math.max(2, Math.round(displayWidth * factor))}px`;
    inner.style.height = `${Math.max(2, Math.round(displayHeight * factor))}px`;
    inner.style.transform = `scale(${1 / factor})`;
  }

  function makeElement(asset, wantsPicture) {
    if (asset.kind === 'image') {
      const image = document.createElement('img');
      image.src = window.api.fileUrl(asset.path);
      image.className = 'stage-media';
      return { element: image, kind: 'image' };
    }
    // An audio element fed an mp4 plays its sound and nothing else, which is
    // what a video clip dropped on an audio track should do.
    const element = document.createElement(wantsPicture ? 'video' : 'audio');
    element.src = window.api.fileUrl(asset.path);
    element.preload = 'auto';
    element.className = 'stage-media';
    element.playsInline = true;
    return { element, kind: wantsPicture ? 'video' : 'audio' };
  }

  function entryFor(clip, asset, wantsPicture) {
    let entry = pool.get(clip.id);
    if (entry && entry.path === asset.path && entry.wantsPicture === wantsPicture) return entry;
    if (entry) entry.element.remove();
    const made = makeElement(asset, wantsPicture);
    entry = {
      element: made.element,
      kind: made.kind,
      path: asset.path,
      wantsPicture,
    };
    pool.set(clip.id, entry);
    inner.appendChild(made.element);
    return entry;
  }

  function hide(entry) {
    entry.element.classList.remove('on');
    if (entry.kind !== 'image' && !entry.element.paused) entry.element.pause();
  }

  /** Put every element where the playhead says it should be. Called every
   *  frame, so it does the least work it can: a seek only when the element has
   *  drifted past the tolerance for the current quality. */
  function syncTimeline() {
    const project = getProject();
    if (!project) return;
    const drift = QUALITY[quality].drift;
    const videoTracks = L.tracksOf(project, 'video');
    const active = L.clipsAt(project, positionMs);
    const live = new Set();

    for (const { track, clip, sourceMs } of active) {
      if (track.hidden) continue;
      if (track.kind === 'audio' && track.muted) continue;
      const asset = L.findAsset(project, clip.assetId);
      if (!asset) continue;
      const wantsPicture = track.kind === 'video' && asset.kind !== 'audio';
      const entry = entryFor(clip, asset, wantsPicture);
      live.add(clip.id);
      entry.element.classList.add('on');
      if (wantsPicture) {
        entry.element.style.zIndex = String(videoTracks.indexOf(track) + 1);
        entry.element.style.opacity = String(clamp01(clip.opacity));
      }
      if (entry.kind === 'image') continue;

      const target = sourceMs / 1000;
      if (Math.abs(entry.element.currentTime - target) > (playing ? drift : 0.03)) {
        try {
          entry.element.currentTime = target;
        } catch (error) {
          // Seeking before metadata arrives throws; the next frame retries.
        }
      }
      entry.element.volume = clamp01(clip.volume);
      entry.element.muted =
        (track.kind === 'video' && track.muted) || (scrubbing && muteWhileScrubbing);
      if (playing && entry.element.paused) entry.element.play().catch(() => {});
      if (!playing && !entry.element.paused) entry.element.pause();
    }

    for (const [clipId, entry] of pool) {
      if (!live.has(clipId)) hide(entry);
    }
  }

  function syncAsset() {
    if (!assetElement) return;
    if (assetElement.tagName === 'IMG') return;
    if (playing && assetElement.paused) assetElement.play().catch(() => {});
    if (!playing && !assetElement.paused) assetElement.pause();
    positionMs = assetElement.currentTime * 1000;
  }

  function totalMs() {
    if (mode === 'asset') {
      if (!assetShown) return 0;
      if (assetElement && Number.isFinite(assetElement.duration)) {
        return assetElement.duration * 1000;
      }
      return assetShown.durationMs || 0;
    }
    const project = getProject();
    return project ? L.projectDurationMs(project) : 0;
  }

  function frame() {
    if (playing && mode === 'timeline') {
      positionMs = performance.now() - clockOrigin;
      const total = totalMs();
      if (positionMs >= total) {
        positionMs = total;
        pause();
      }
    }
    if (mode === 'timeline') syncTimeline();
    else syncAsset();

    const rounded = Math.round(positionMs);
    if (rounded !== lastReported) {
      lastReported = rounded;
      if (onTick) onTick(positionMs, playing);
    }
    requestAnimationFrame(frame);
  }

  function play() {
    if (playing) return;
    if (totalMs() <= 0) return;
    clearExact();
    if (mode === 'timeline' && positionMs >= totalMs()) positionMs = 0;
    playing = true;
    clockOrigin = performance.now() - positionMs;
    if (onTick) onTick(positionMs, playing);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    for (const entry of pool.values()) {
      if (entry.kind !== 'image' && !entry.element.paused) entry.element.pause();
    }
    if (assetElement && assetElement.pause) assetElement.pause();
    if (onTick) onTick(positionMs, playing);
  }

  function seek(ms) {
    positionMs = Math.max(0, Math.min(ms, Math.max(totalMs(), 0)));
    clockOrigin = performance.now() - positionMs;
    if (mode === 'asset' && assetElement && assetElement.currentTime !== undefined) {
      try {
        assetElement.currentTime = positionMs / 1000;
      } catch (error) {
        // Same as above: retried on the next frame.
      }
    }
    if (onTick) onTick(positionMs, playing);
  }

  /** Elements outlive the clips that made them unless something removes them,
   *  and every one holds a decoder. Called after any edit that drops clips. */
  function prune() {
    const project = getProject();
    const alive = new Set();
    if (project) {
      for (const track of project.tracks) {
        for (const clip of track.clips) alive.add(clip.id);
      }
    }
    for (const [clipId, entry] of pool) {
      if (alive.has(clipId)) continue;
      entry.element.pause && entry.element.pause();
      entry.element.removeAttribute('src');
      entry.element.remove();
      pool.delete(clipId);
    }
  }

  function clear() {
    for (const entry of pool.values()) {
      entry.element.pause && entry.element.pause();
      entry.element.removeAttribute('src');
      entry.element.remove();
    }
    pool.clear();
    positionMs = 0;
    playing = false;
  }

  function showAsset(asset) {
    mode = 'asset';
    clearExact();
    pause();
    for (const entry of pool.values()) hide(entry);
    if (assetElement) assetElement.remove();
    assetShown = asset || null;
    if (!asset) {
      assetElement = null;
      return;
    }
    const made = makeElement(asset, asset.kind !== 'audio');
    assetElement = made.element;
    if (made.kind === 'audio') assetElement.controls = false;
    assetElement.classList.add('on');
    assetElement.style.zIndex = '50';
    inner.appendChild(assetElement);
    positionMs = 0;
  }

  function showTimeline() {
    mode = 'timeline';
    pause();
    if (assetElement) {
      assetElement.remove();
      assetElement = null;
    }
    assetShown = null;
    positionMs = 0;
  }

  /** Show one frame drawn by the Rust compositor — the same shader, the same
   *  geometry and the same source frames the render uses. It sits above the
   *  stacked elements, so what is underneath keeps its place for when playback
   *  starts again. */
  function showExact(frame) {
    if (!exactCanvas || !frame || !frame.width || !frame.height) return false;
    exactCanvas.width = frame.width;
    exactCanvas.height = frame.height;
    const context = exactCanvas.getContext('2d');
    if (!context) return false;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height),
      0,
      0
    );
    exactCanvas.classList.add('on');
    return true;
  }

  function clearExact() {
    if (exactCanvas) exactCanvas.classList.remove('on');
  }

  function isExact() {
    return Boolean(exactCanvas && exactCanvas.classList.contains('on'));
  }

  function setQuality(next) {
    if (!QUALITY[next]) return;
    quality = next;
    layout();
  }

  function setScrubbing(value) {
    scrubbing = Boolean(value);
  }

  function setMuteWhileScrubbing(value) {
    muteWhileScrubbing = Boolean(value);
  }

  if (wrap && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => layout()).observe(wrap);
  }
  requestAnimationFrame(frame);

  return {
    layout,
    play,
    pause,
    showExact,
    clearExact,
    isExact,
    toggle: () => (playing ? pause() : play()),
    isPlaying: () => playing,
    seek,
    position: () => positionMs,
    total: totalMs,
    mode: () => mode,
    prune,
    clear,
    showAsset,
    showTimeline,
    setQuality,
    setScrubbing,
    setMuteWhileScrubbing,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createPreview, QUALITY };
} else {
  globalThis.previewLib = { createPreview, QUALITY };
}
