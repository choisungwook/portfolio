'use strict';

(function () {

// The preview: real media elements, stacked and driven by a clock.
//
// There is no compositor here and no decoding in Rust. One element per clip
// sits in the stage, the playhead decides which are visible, and the browser
// does the drawing. That is why the preview is an approximation of the render
// rather than the render itself; see adr/2026-08-preview-in-the-webview.md.
//
// The position this reports and takes is a frame on the project rate, because
// that is what the timeline is counted in. It is allowed a fraction, because a
// media element's clock does not stop on frame boundaries and rounding it to
// one would make playback stutter for no reason. Everything handed to a media
// element is seconds, converted at that boundary through time.js.

// scale is what the stacked elements are actually laid out at before being
// scaled back up, so a lower setting composites a smaller surface.
const QUALITY = {
  full: { scale: 1 },
  half: { scale: 0.5 },
  quarter: { scale: 0.25 },
};

const T =
  typeof module !== 'undefined' && module.exports ? require('./time.js') : globalThis.timeLib;

const GEO =
  typeof module !== 'undefined' && module.exports
    ? require('./geometry.js')
    : globalThis.geometryLib;

const RATE_SYNC_THRESHOLD = 0.04;
const HARD_SYNC_THRESHOLD = 1;
const MAX_RATE_ADJUSTMENT = 0.05;

/** Where the timeline is, given where the clip that is driving the clock has
 *  got to in its own source. */
function timelineTimeFromMedia(clip, currentTime, rate) {
  return clip.start + (T.secondsToFrames(currentTime, rate) - clip.in);
}

function playbackRateForDrift(drift) {
  if (Math.abs(drift) <= RATE_SYNC_THRESHOLD) return 1;
  const adjustment = Math.max(
    -MAX_RATE_ADJUSTMENT,
    Math.min(MAX_RATE_ADJUSTMENT, drift * 0.25)
  );
  return 1 + adjustment;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function createPreview(options) {
  const { stage, inner, wrap, exactCanvas, getProject, onTick, qualityMonitor } = options;
  const playbackPath = options.playbackPath || ((asset) => asset.path);
  const L = globalThis.timelineLib;

  const pool = new Map();
  let assetElement = null;
  let assetShown = null;
  let mode = 'timeline';
  let quality = 'half';
  let scrubbing = false;
  let muteWhileScrubbing = true;
  let playing = false;
  let starting = false;
  let positionFrames = 0;
  let clockOrigin = 0;
  let clock = null;
  let timelineDiscontinuity = false;
  let playGeneration = 0;
  let lastReported = -1;
  const playPromises = new WeakMap();

  function settings() {
    const project = getProject();
    return (project && project.settings) || { width: 1920, height: 1080, rate: T.fps(30) };
  }

  function rate() {
    return settings().rate || T.fps(30);
  }

  /** Where the playhead is in seconds, which is the only thing a media element
   *  understands. */
  function positionSeconds() {
    return T.framesToSeconds(positionFrames, rate());
  }

  /** Size the stage to the fitted box, then lay the media out at the quality
   *  scale and scale it back up so it still fills that box.
   *
   *  The box itself comes from `geometry.js` and not from here, because the
   *  native monitor places a view on the same box and the two must not be two
   *  different calculations. The panel centres the stage in CSS, which is the
   *  same centring `stageBoxOf` did in arithmetic, so only the size is written
   *  and the position follows.
   *
   *  Scaling back up uses the ratio the rounded inner box actually is rather
   *  than `1 / factor`. Rounding 641 at half quality gives 321, and doubling
   *  that is 642 — a pixel of the stack hanging past the stage on every odd
   *  width. */
  function layout() {
    if (!wrap) return;
    const box = GEO.stageBoxOf(wrap.getBoundingClientRect(), getProject());
    stage.style.width = `${box.width}px`;
    stage.style.height = `${box.height}px`;
    if (!GEO.isDrawable(box)) {
      inner.style.width = '0px';
      inner.style.height = '0px';
      inner.style.transform = 'none';
      return;
    }
    const factor = QUALITY[quality].scale;
    const innerWidth = Math.max(1, Math.round(box.width * factor));
    const innerHeight = Math.max(1, Math.round(box.height * factor));
    inner.style.width = `${innerWidth}px`;
    inner.style.height = `${innerHeight}px`;
    inner.style.transform = `scale(${box.width / innerWidth}, ${box.height / innerHeight})`;
  }

  function makeElement(asset, wantsPicture) {
    const path = playbackPath(asset);
    if (asset.kind === 'image') {
      const image = document.createElement('img');
      image.src = window.api.fileUrl(path);
      image.className = 'stage-media';
      return { element: image, kind: 'image' };
    }
    // An audio element fed an mp4 plays its sound and nothing else, which is
    // what a video clip dropped on an audio track should do.
    const element = document.createElement(wantsPicture ? 'video' : 'audio');
    element.src = window.api.fileUrl(path);
    element.preload = 'auto';
    element.className = 'stage-media';
    element.playsInline = true;
    if (wantsPicture && qualityMonitor) qualityMonitor.watchVideo(element);
    return { element, kind: wantsPicture ? 'video' : 'audio' };
  }

  function entryFor(clip, asset, wantsPicture) {
    const path = playbackPath(asset);
    let entry = pool.get(clip.id);
    if (entry && entry.path === path && entry.wantsPicture === wantsPicture) return entry;
    if (entry) {
      if (entry.kind === 'video' && qualityMonitor) qualityMonitor.unwatchVideo(entry.element);
      entry.element.remove();
    }
    const made = makeElement(asset, wantsPicture);
    entry = {
      element: made.element,
      kind: made.kind,
      path,
      wantsPicture,
    };
    pool.set(clip.id, entry);
    inner.appendChild(made.element);
    return entry;
  }

  function hide(entry) {
    entry.element.classList.remove('on');
    if (entry.kind !== 'image') {
      entry.element.playbackRate = 1;
      if (!entry.element.paused) entry.element.pause();
    }
  }

  function ensurePlaying(element) {
    if (!element.paused) return Promise.resolve(true);
    const pending = playPromises.get(element);
    if (pending) return pending;
    const started = Promise.resolve(element.play())
      .then(() => !element.paused)
      .catch(() => false)
      .finally(() => playPromises.delete(element));
    playPromises.set(element, started);
    return started;
  }

  /** Put every element where the playhead says it should be. The clock element
   *  runs freely. Followers change rate for ordinary drift and seek only when
   *  they are far enough away that gradual correction would be visible. */
  function syncTimeline() {
    const project = getProject();
    if (!project) return null;
    const videoTracks = L.tracksOf(project, 'video');
    const active = L.clipsAt(project, positionFrames);
    const live = new Set();
    const media = [];
    let seekFailed = false;

    for (const { track, clip, sourceFrame } of active) {
      if (track.hidden) continue;
      if (track.kind === 'audio' && track.muted) continue;
      const asset = L.findAsset(project, clip.assetId);
      if (!asset) continue;
      const wantsPicture = track.kind === 'video' && asset.kind !== 'audio';
      const entry = entryFor(clip, asset, wantsPicture);
      const wasLive = entry.element.classList.contains('on');
      live.add(clip.id);
      entry.element.classList.add('on');
      if (wantsPicture) {
        entry.element.style.zIndex = String(videoTracks.indexOf(track) + 1);
        entry.element.style.opacity = String(clamp01(clip.opacity));
      }
      if (entry.kind === 'image') continue;

      const target = T.framesToSeconds(sourceFrame, rate());
      media.push({ entry, track, clip, target, wasLive });
    }

    const reference =
      media.find(({ clip }) => clock && clip.id === clock.clip.id) || media[0] || null;

    for (const item of media) {
      const { entry, track, clip, target, wasLive } = item;
      const drift = target - entry.element.currentTime;
      const isReference = item === reference;
      const needsInitialSeek =
        !playing || !wasLive || timelineDiscontinuity || (isReference && entry.element.paused);
      const needsHardSeek = !isReference && Math.abs(drift) >= HARD_SYNC_THRESHOLD;

      if ((needsInitialSeek && Math.abs(drift) > 0.03) || needsHardSeek) {
        try {
          entry.element.currentTime = target;
        } catch (error) {
          seekFailed = true;
        }
      }
      entry.element.playbackRate =
        playing && !isReference && !needsHardSeek ? playbackRateForDrift(drift) : 1;
      entry.element.volume = clamp01(clip.volume);
      entry.element.muted =
        (track.kind === 'video' && track.muted) || (scrubbing && muteWhileScrubbing);
      if (
        qualityMonitor &&
        (playing || starting) &&
        !isReference &&
        reference &&
        track.kind !== reference.track.kind
      ) {
        qualityMonitor.sampleDrift(drift * 1000);
      }
      if (playing || starting) ensurePlaying(entry.element);
      if (!playing && !starting && !entry.element.paused) entry.element.pause();
    }

    for (const [clipId, entry] of pool) {
      if (!live.has(clipId)) hide(entry);
    }
    timelineDiscontinuity = seekFailed;
    return reference;
  }

  function syncAsset() {
    if (!assetElement) return;
    if (assetElement.tagName === 'IMG') return;
    if ((playing || starting) && assetElement.paused) ensurePlaying(assetElement);
    if (!playing && !starting && !assetElement.paused) assetElement.pause();
    positionFrames = T.secondsToFrames(assetElement.currentTime, rate());
  }

  /** How long what is being shown is, in frames of the project rate. An asset
   *  being previewed on its own is measured on that rate too: it is the clock
   *  the transport reads, not a claim about the file. */
  function totalFrames() {
    if (mode === 'asset') {
      if (!assetShown) return 0;
      if (assetElement && Number.isFinite(assetElement.duration)) {
        return T.secondsToFrames(assetElement.duration, rate());
      }
      return T.framesFromMillis(assetShown.durationMs || 0, rate());
    }
    const project = getProject();
    return project ? L.projectDurationFrames(project) : 0;
  }

  function transportActive() {
    return playing || starting;
  }

  function frame() {
    if (playing && mode === 'timeline') {
      if (
        clock &&
        !clock.entry.element.paused &&
        Number.isFinite(clock.entry.element.currentTime)
      ) {
        positionFrames = timelineTimeFromMedia(
          clock.clip,
          clock.entry.element.currentTime,
          rate()
        );
      } else {
        // Nothing is playing yet, so the wall clock stands in. It is in
        // milliseconds because performance.now() is.
        positionFrames = T.secondsToFrames((performance.now() - clockOrigin) / 1000, rate());
      }
      const total = totalFrames();
      if (positionFrames >= total) {
        positionFrames = total;
        pause();
      }
    }
    if (mode === 'timeline') {
      const nextClock = syncTimeline();
      const readyClock = nextClock && !nextClock.entry.element.paused ? nextClock : null;
      if (!clock || !readyClock || clock.clip.id !== readyClock.clip.id) {
        clock = readyClock;
        clockOrigin = performance.now() - positionSeconds() * 1000;
      }
    } else syncAsset();

    // Reported when it lands on a new frame, which is also how often the
    // playhead and the clock can actually change.
    const rounded = Math.round(positionFrames);
    if (rounded !== lastReported) {
      lastReported = rounded;
      if (onTick) onTick(positionFrames, transportActive());
    }
    requestAnimationFrame(frame);
  }

  async function play() {
    if (playing || starting) return;
    if (totalFrames() <= 0) return;
    clearExact();
    if (mode === 'timeline' && positionFrames >= totalFrames()) positionFrames = 0;
    if (qualityMonitor) qualityMonitor.playbackRequested();
    starting = true;
    if (onTick) onTick(positionFrames, transportActive());
    const generation = ++playGeneration;
    let reference = null;
    if (mode === 'timeline') {
      clock = null;
      reference = syncTimeline();
      if (reference && !(await ensurePlaying(reference.entry.element))) {
        if (generation === playGeneration) pause();
        return;
      }
    } else if (assetElement) {
      if (!(await ensurePlaying(assetElement))) {
        if (generation === playGeneration) pause();
        return;
      }
    }
    if (generation !== playGeneration || !starting) return;
    starting = false;
    playing = true;
    clock = reference;
    clockOrigin = performance.now() - positionSeconds() * 1000;
    if (onTick) onTick(positionFrames, transportActive());
  }

  function pause() {
    if (!playing && !starting) return;
    playGeneration += 1;
    starting = false;
    playing = false;
    clock = null;
    for (const entry of pool.values()) {
      if (entry.kind !== 'image') {
        entry.element.playbackRate = 1;
        if (!entry.element.paused) entry.element.pause();
      }
    }
    if (assetElement && assetElement.pause) assetElement.pause();
    if (onTick) onTick(positionFrames, transportActive());
  }

  /** `frames` is a position on the project rate. Whole ones come from the
   *  keyboard and the transport; a scrub gives a fraction and it is kept, so
   *  dragging the playhead does not feel notched. */
  function seek(frames) {
    if (qualityMonitor && qualityMonitor.isRunning()) qualityMonitor.discontinuity();
    positionFrames = Math.max(0, Math.min(frames, Math.max(totalFrames(), 0)));
    clockOrigin = performance.now() - positionSeconds() * 1000;
    clock = null;
    timelineDiscontinuity = mode === 'timeline';
    if (mode === 'asset' && assetElement && assetElement.currentTime !== undefined) {
      try {
        assetElement.currentTime = positionSeconds();
      } catch (error) {
        // Same as above: retried on the next frame.
      }
    }
    if (mode === 'timeline') clock = syncTimeline();
    if (onTick) onTick(positionFrames, transportActive());
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
      if (entry.kind === 'video' && qualityMonitor) qualityMonitor.unwatchVideo(entry.element);
      entry.element.removeAttribute('src');
      entry.element.remove();
      pool.delete(clipId);
    }
  }

  function clear() {
    for (const entry of pool.values()) {
      entry.element.pause && entry.element.pause();
      if (entry.kind === 'video' && qualityMonitor) qualityMonitor.unwatchVideo(entry.element);
      entry.element.removeAttribute('src');
      entry.element.remove();
    }
    pool.clear();
    positionFrames = 0;
    starting = false;
    playing = false;
    clock = null;
  }

  function showAsset(asset) {
    mode = 'asset';
    clearExact();
    pause();
    for (const entry of pool.values()) hide(entry);
    if (assetElement) {
      if (assetElement.tagName === 'VIDEO' && qualityMonitor) {
        qualityMonitor.unwatchVideo(assetElement);
      }
      assetElement.remove();
    }
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
    positionFrames = 0;
  }

  function showTimeline() {
    mode = 'timeline';
    pause();
    if (assetElement) {
      if (assetElement.tagName === 'VIDEO' && qualityMonitor) {
        qualityMonitor.unwatchVideo(assetElement);
      }
      assetElement.remove();
      assetElement = null;
    }
    assetShown = null;
    positionFrames = 0;
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
    toggle: () => (playing || starting ? pause() : play()),
    isPlaying: transportActive,
    seek,
    position: () => positionFrames,
    total: totalFrames,
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
  module.exports = {
    createPreview,
    QUALITY,
    timelineTimeFromMedia,
    playbackRateForDrift,
    HARD_SYNC_THRESHOLD,
  };
} else {
  globalThis.previewLib = { createPreview, QUALITY };
}
})();
