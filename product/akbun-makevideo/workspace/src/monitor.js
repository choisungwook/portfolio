'use strict';

(function () {

// The native monitor, from the page's side.
//
// Rust owns the picture: it decodes, it composites, and it draws on a surface
// under this window. The page owns where that surface goes, what the transport
// buttons mean, and nothing else. No frame ever crosses between them — see
// wiki/architecture/viewport.md.
//
// What this module actually is, is a router. The app has two playback engines
// and the rest of the page must not know which one is running, so everything
// here has the same shape as `preview.js` and forwards to one or the other:
//
// | Case | Who plays |
// |---|---|
// | Native engine, timeline | Rust, through the commands below |
// | Media element engine | `preview.js`, exactly as before |
// | Previewing one asset | `preview.js`, on both engines |
//
// The asset case stays in the page on purpose. Previewing an imported file is
// not the timeline and has no compositor in it; giving it a second path through
// Rust would be a whole engine for a thing a `<video>` tag already does.

const T =
  typeof module !== 'undefined' && module.exports ? require('./time.js') : globalThis.timeLib;

/** The stage box as physical pixels inside the window.
 *
 *  Physical, because that is what a native view is placed in and what a
 *  swapchain is sized in. CSS pixels and physical pixels are the same number
 *  only on a display nobody at this desk has, and the difference is invisible
 *  until the picture is a quarter of the size of its box.
 *
 *  This is the page's half of the platform layer, and it is the half most
 *  likely to be wrong, so it is a function over two plain objects rather than
 *  something that needs a window to test. */
function placeOf(box, ratio) {
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    x: Math.round(box.left * scale),
    y: Math.round(box.top * scale),
    width: Math.max(0, Math.round(box.width * scale)),
    height: Math.max(0, Math.round(box.height * scale)),
  };
}

/** Whether two placements are the same box, so a resize observer firing on
 *  every frame of a drag does not send a command for every one of them. */
function samePlace(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** What the page should do with the answer to `playbackAttach`.
 *
 *  Three outcomes and they are not two: a fallback and a preference both end at
 *  the media elements, and only one of them is worth telling somebody about.
 *  Showing "playback fell back" to a user who chose the media element engine
 *  would be the app complaining about their own setting. */
function readChoice(answer) {
  if (!answer || typeof answer !== 'object') {
    return { native: false, notice: null };
  }
  return {
    native: answer.engine === 'native',
    notice: answer.fellBack || null,
  };
}

function createMonitor(options) {
  const { preview, stage, api, onTick, onNotice } = options;
  const L = globalThis.timelineLib;

  let native = false;
  let lastPlace = null;
  let polling = false;
  let position = 0;
  let playing = false;
  let attaching = null;

  function timelineMode() {
    return preview.mode() === 'timeline';
  }

  /** Native only drives the timeline. An asset preview is a media element on
   *  both engines, so the router asks this before every transport call. */
  function drivingNatively() {
    return native && timelineMode();
  }

  function rate() {
    const project = getProject();
    return (project && project.settings && project.settings.rate) || T.fps(30);
  }

  function getProject() {
    return options.getProject ? options.getProject() : null;
  }

  function total() {
    return preview.total();
  }

  function currentPlace() {
    if (!stage) return null;
    return placeOf(stage.getBoundingClientRect(), window.devicePixelRatio);
  }

  /** Ask Rust for a monitor, and take whatever it gives back.
   *
   *  Called when a project opens and when the setting changes. It never
   *  rejects: a monitor that will not start is the media element preview with a
   *  reason, which is the whole point of keeping that preview. */
  async function attach() {
    if (!api || !api.available) return false;
    const place = currentPlace();
    if (!place || place.width < 1 || place.height < 1) return native;
    // One at a time. The layout settles over several frames when a project
    // opens, and a second attach mid-flight would start a session the first one
    // is about to replace.
    if (attaching) return attaching;
    attaching = (async () => {
      try {
        const answer = await api.playbackAttach(place, Math.round(position));
        const choice = readChoice(answer);
        native = choice.native;
        lastPlace = native ? place : null;
        if (native) {
          // The stacked elements are not what is on screen any more, and every
          // one of them holds a decoder.
          preview.pause();
          preview.clear();
          preview.clearExact();
        }
        if (onNotice) onNotice(choice.notice);
        return native;
      } catch (error) {
        native = false;
        if (onNotice) onNotice(String(error));
        return false;
      } finally {
        attaching = null;
      }
    })();
    return attaching;
  }

  async function release() {
    if (!api || !api.available) return;
    native = false;
    lastPlace = null;
    try {
      await api.playbackRelease();
    } catch (error) {
      // Nothing to do about it and nothing depends on it: the session is
      // already forgotten here, and dropping it is what its own thread does.
    }
  }

  /** Tell Rust where the box is now. Cheap enough to call on every layout, and
   *  it compares before sending so a drag is one command per pixel rather than
   *  one per frame. */
  function place() {
    if (!drivingNatively()) return;
    const next = currentPlace();
    if (!next || samePlace(next, lastPlace)) return;
    lastPlace = next;
    api.playbackPlace(next).catch(() => {});
  }

  /** Read the playhead back.
   *
   *  Polled rather than pushed. A frame is 33 ms and an event per frame across
   *  the IPC boundary is exactly the traffic the native monitor exists to
   *  remove; what the page needs is the playhead often enough to draw it, which
   *  is its own animation frame. One request in flight at a time, so a slow
   *  answer cannot queue up behind itself. */
  function poll() {
    if (!drivingNatively() || polling) return;
    polling = true;
    api
      .playbackStatus()
      .then((status) => {
        polling = false;
        if (!status) return;
        take(status);
      })
      .catch(() => {
        polling = false;
      });
  }

  function take(status) {
    if (!status) return;
    const wasPlaying = playing;
    position = status.position;
    playing = status.playing;
    if (status.failure && onNotice) onNotice(status.failure);
    if (onTick) onTick(position, playing);
    // Reaching the end stops the monitor on its own, and the page's play button
    // has to notice.
    if (wasPlaying && !playing && onTick) onTick(position, false);
  }

  function frame() {
    poll();
    requestAnimationFrame(frame);
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);

  // The stage box moves for reasons the page never sends a command about: a
  // panel being dragged, the preview quality changing the layout, the window
  // being zoomed. The native view is placed in the window and not laid out by
  // the page, so something has to notice.
  if (stage && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => place()).observe(stage);
  }

  return {
    attach,
    release,
    place,
    usesNativeMonitor: drivingNatively,

    /** Show or hide the native view.
     *
     *  The page calls this before drawing anything over the stage. A native
     *  view is not in the page's stacking order, so a settings sheet opened
     *  over a visible monitor would be behind the picture. Playback keeps
     *  running while it is hidden, which is why closing the sheet shows where
     *  the playhead got to rather than where it was. */
    setVisible(visible) {
      if (!native) return;
      api.playbackVisible(Boolean(visible)).catch(() => {});
    },

    layout() {
      preview.layout();
      place();
    },

    play() {
      if (!drivingNatively()) return preview.play();
      if (total() <= 0) return;
      if (position >= total()) position = 0;
      playing = true;
      if (onTick) onTick(position, true);
      return api.playbackPlay().then(take).catch(() => {});
    },

    pause() {
      if (!drivingNatively()) return preview.pause();
      playing = false;
      if (onTick) onTick(position, false);
      return api.playbackPause().then(take).catch(() => {});
    },

    toggle() {
      return this.isPlaying() ? this.pause() : this.play();
    },

    isPlaying() {
      return drivingNatively() ? playing : preview.isPlaying();
    },

    seek(frames) {
      if (!drivingNatively()) return preview.seek(frames);
      const target = Math.max(0, Math.min(Math.round(frames), Math.max(total(), 0)));
      position = target;
      if (onTick) onTick(position, playing);
      return api.playbackSeek(target).catch(() => {});
    },

    /** The timeline changed under a stopped playhead. A playing one is left
     *  alone: its frame source is already reading the edit it was built from,
     *  and rebuilding mid-playback would be a stall. */
    redraw() {
      if (!drivingNatively()) return;
      api.playbackRedraw().catch(() => {});
    },

    position() {
      return drivingNatively() ? position : preview.position();
    },

    total,
    mode: preview.mode,
    prune: preview.prune,

    clear() {
      position = 0;
      playing = false;
      preview.clear();
    },

    showAsset(asset) {
      // An asset preview is a media element even on the native engine, so the
      // monitor is told to stop drawing the timeline behind it.
      if (native) api.playbackPause().catch(() => {});
      preview.showAsset(asset);
    },

    showTimeline() {
      preview.showTimeline();
      position = 0;
      playing = false;
      place();
    },

    setQuality: preview.setQuality,
    setScrubbing: preview.setScrubbing,
    setMuteWhileScrubbing: preview.setMuteWhileScrubbing,

    // The exact frame is a media element idea. On the native engine the frame
    // under a stopped playhead is drawn by the same compositor, on the same
    // surface, as the frames during playback — there is nothing left for a
    // second path to show or for a badge to tell apart.
    showExact(drawn) {
      return drivingNatively() ? false : preview.showExact(drawn);
    },
    clearExact() {
      if (!drivingNatively()) preview.clearExact();
    },
    isExact() {
      return drivingNatively() ? false : preview.isExact();
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMonitor, placeOf, samePlace, readChoice };
} else {
  globalThis.monitorLib = { createMonitor, placeOf, samePlace, readChoice };
}
})();
