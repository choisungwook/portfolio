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

// Every rectangle this module sends comes out of `geometry.js`. Placing a
// native view is the half of the platform layer most likely to be silently
// wrong, so the arithmetic lives in a file with no window in it and this one
// only decides *when* to ask.
const GEO =
  typeof module !== 'undefined' && module.exports
    ? require('./geometry.js')
    : globalThis.geometryLib;

const { samePlace } = GEO;

/** Whether the native view should be on screen right now.
 *
 *  The view sits **over** the webview and is not in the page's stacking order,
 *  so anything the page draws on the stage would be behind it. That makes
 *  visibility one rule with five inputs rather than a call at each of the
 *  places that happens to cover it — which is how the asset preview ended up
 *  hidden behind a paused monitor.
 *
 *  - `native`: there is a session at all.
 *  - `timeline`: the stage is showing the timeline. An asset preview is a
 *    media element in the page on both engines, so the view has to get out of
 *    its way.
 *  - `hasContent`: the timeline has something on it. An empty one puts the
 *    "drop media here" hint on the stage, and that is drawn by the page too.
 *  - `covered`: a sheet or an open menu is over the stage.
 *  - `roomy`: the panel is big enough to fit a picture in. A panel dragged
 *    shut has no box, and a view cannot be placed at nothing — it would be a
 *    pixel of black in the corner rather than an absence. */
function shouldShowMonitor(state) {
  return Boolean(
    state.native && state.timeline && state.hasContent && state.roomy && !state.covered
  );
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
  // The panel, not the stage element. The box is computed from the room
  // available rather than read back off the element the page laid out, so the
  // native view is never a frame behind what the page did — see `layout()`.
  const panel = options.wrap || stage;
  const L = globalThis.timelineLib;

  let native = false;
  let covered = false;
  let editing = false;
  let lastVisible = null;
  let lastPlace = null;
  let polling = false;
  let position = 0;
  let playing = false;
  let attaching = null;
  let attachWanted = false;
  let mediaRefreshPending = false;
  let refreshingMedia = null;
  let viewport = GEO.fittedViewport();

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

  /** Send the view's visibility only when it actually changes. The renderer
   *  asks on every timeline redraw, and one command per redraw would be a
   *  round trip for every keystroke that moves a clip.
   *
   *  `box` is passed in by the callers that have just measured one, so a frame
   *  that both places the view and checks whether it should be on screen is one
   *  layout read rather than two. */
  function syncVisibility(box) {
    if (!native) return;
    const wanted = shouldShowMonitor({
      native,
      timeline: timelineMode(),
      hasContent: total() > 0,
      roomy: GEO.isDrawable(box === undefined ? stageBox() : box),
      covered: covered || editing,
    });
    if (wanted === lastVisible) return;
    lastVisible = wanted;
    api.playbackVisible(wanted).catch(() => {});
  }

  /** The stage box as it is right now, from the panel and the project.
   *
   *  Measuring the panel rather than the stage element is what makes this
   *  independent of whether the page has laid out yet: the same inputs go into
   *  `preview.layout()`, so both answers describe the same moment even on the
   *  frame a project's resolution changes. */
  function stageBox() {
    return panel ? GEO.stageBoxOf(panel.getBoundingClientRect(), getProject()) : null;
  }

  function currentPlace() {
    const box = stageBox();
    if (!box) return null;
    // Held here rather than inside the measurement. A panel shrinking has to
    // pull an enlarged picture back against its edges, and a getter that
    // quietly rewrites the pan state is a measurement with a side effect.
    viewport = GEO.clampViewport(viewport, box);
    return {
      stage: GEO.placeOf(box),
      content: GEO.placeOf(GEO.contentBoxOf(box, viewport)),
    };
  }

  /** Ask Rust for a monitor, and take whatever it gives back.
   *
   *  Called when a project opens and when the setting changes. It never
   *  rejects: a monitor that will not start is the media element preview with a
   *  reason, which is the whole point of keeping that preview. */
  async function attach() {
    if (!api || !api.available) return false;
    attachWanted = true;
    if (options.pageOverlayActive && options.pageOverlayActive()) {
      attachWanted = false;
      native = false;
      lastPlace = null;
      lastVisible = null;
      preview.seek(position);
      return false;
    }
    const place = currentPlace();
    // No room yet. The window is still being laid out, or the panel is dragged
    // shut. Giving up here permanently was a silent fallback to the media
    // elements for the whole session, so the want is remembered and the
    // animation frame asks again once there is a box to attach to.
    if (!place || place.stage.width < 1 || place.stage.height < 1) return native;
    attachWanted = false;
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
        lastVisible = null;
        syncVisibility();
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
    // Including a want that was still waiting for room. Releasing is the page
    // saying it does not have a monitor any more, and the retry would hand it
    // one back on the next frame.
    attachWanted = false;
    lastPlace = null;
    lastVisible = null;
    covered = false;
    try {
      await api.playbackRelease();
    } catch (error) {
      // Nothing to do about it and nothing depends on it: the session is
      // already forgotten here, and dropping it is what its own thread does.
    }
  }

  async function applyMediaRefresh() {
    if (!mediaRefreshPending || refreshingMedia || currentlyPlaying()) return refreshingMedia;
    mediaRefreshPending = false;
    refreshingMedia = (async () => {
      if (drivingNatively()) {
        await release();
        await attach();
      }
      // Nothing for the media elements. Their pool is keyed by the path
      // `playbackPath` hands back, and the animation frame compares it on every
      // pass — paused as well as playing — so a ready proxy is picked up on the
      // next frame without being told. There is no redraw to call here, and the
      // one that used to be called did not exist.
    })();
    try {
      await refreshingMedia;
    } finally {
      refreshingMedia = null;
      if (mediaRefreshPending && !currentlyPlaying()) {
        void applyMediaRefresh().catch(() => {});
      }
    }
  }

  function currentlyPlaying() {
    return drivingNatively() ? playing : preview.isPlaying();
  }

  /** Tell Rust where the box is now, and whether there is still room for it.
   *
   *  Called on every animation frame, so it compares before sending: a drag is
   *  one command per pixel the box actually moved rather than one per frame.
   *  Returns the box it measured, so the frame loop can use it again without a
   *  second layout read. */
  function place() {
    const box = stageBox();
    if (!drivingNatively()) return box;
    // A panel dragged shut is a reason to get out of the way, and it is the one
    // reason that is a measurement rather than a flag somebody set.
    syncVisibility(box);
    const next = currentPlace();
    if (!next || samePlace(next, lastPlace)) return box;
    lastPlace = next;
    api.playbackPlace(next).catch(() => {});
    return box;
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

  /** The box is re-measured on every animation frame, and `place()` compares
   *  before it sends.
   *
   *  This replaced a `ResizeObserver` on the stage element, which only fires
   *  when the box changes *size*. Everything that moves the stage without
   *  resizing it — a sibling panel widening, the timeline growing, a scrollbar
   *  appearing, the inspector opening — left the native view at the previous
   *  position, and a native view is over the webview and clipped by nothing, so
   *  it sat over the timeline until something happened to resize it. Listing
   *  the reasons a box can move is a list nobody finishes; measuring is one
   *  layout read per frame in a loop that already runs every frame.
   *
   *  The retry beside it is the other half: an attach that found no room is
   *  finished here rather than being a fallback for the rest of the session. */
  function frame() {
    const box = place();
    if (attachWanted && !attaching && GEO.isDrawable(box)) {
      void Promise.resolve(attach()).catch(() => {});
    }
    poll();
    requestAnimationFrame(frame);
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);

  return {
    attach,
    release,
    place,
    usesNativeMonitor: drivingNatively,

    /** Use newly generated proxy paths without replacing a live decoder.
     *
     *  A native session captures its proxy map when it starts, while media
     *  elements capture their paths when they are drawn. Replacing either
     *  during playback stops the current stream, so defer the refresh until
     *  playback is stopped. */
    refreshMedia() {
      mediaRefreshPending = true;
      return applyMediaRefresh();
    },

    /** The page is about to draw over the stage, or has stopped.
     *
     *  A sheet or an open menu is one of four reasons the view might have to
     *  get out of the way, so this records the reason rather than setting the
     *  visibility — otherwise closing a sheet while an asset is being previewed
     *  would put the monitor back on top of it. Playback keeps running while it
     *  is hidden, which is why closing a sheet shows where the playhead got to
     *  rather than where it was. */
    setVisible(visible) {
      covered = !visible;
      syncVisibility();
    },

    /** The page owns the selection pass. It hides the native surface while an
     *  item is being edited, then shows it again once the editor-only overlay
     *  is gone. The pass never reaches the project or the renderer. */
    setEditing(active) {
      editing = Boolean(active);
      syncVisibility();
    },

    layout() {
      preview.layout();
      place();
    },

    play() {
      const start = () => {
        if (!drivingNatively()) return preview.play();
        if (total() <= 0) return;
        if (position >= total()) position = 0;
        playing = true;
        if (onTick) onTick(position, true);
        return api.playbackPlay().then(take).catch(() => {});
      };
      return mediaRefreshPending ? Promise.resolve(applyMediaRefresh()).then(start) : start();
    },

    async pause() {
      if (!drivingNatively()) {
        await Promise.resolve(preview.pause());
        await applyMediaRefresh();
        return;
      }
      playing = false;
      if (onTick) onTick(position, false);
      try {
        take(await api.playbackPause());
      } catch (_error) {
        return;
      }
      await applyMediaRefresh();
    },

    toggle() {
      return this.isPlaying() ? this.pause() : this.play();
    },

    isPlaying() {
      return currentlyPlaying();
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
      // Visibility first, and outside the guard: a timeline that has just
      // become empty is exactly the case the guard would skip, and it is one
      // of the reasons the view has to get out of the way.
      syncVisibility();
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
      // An asset preview is a media element in the page on both engines, so
      // the monitor stops playing *and* gets out of the way. Without the
      // second half the asset plays behind a native view still showing the
      // last timeline frame, because that view is over the webview.
      if (native) api.playbackPause().catch(() => {});
      preview.showAsset(asset);
      syncVisibility();
    },

    showTimeline() {
      preview.showTimeline();
      position = 0;
      playing = false;
      place();
      syncVisibility();
    },

    setQuality: preview.setQuality,
    setScrubbing: preview.setScrubbing,
    setMuteWhileScrubbing: preview.setMuteWhileScrubbing,

    // The exact frame is a media element idea. On the native engine the frame
    // under a stopped playhead is drawn by the same compositor, on the same
    // surface, as the frames during playback — there is nothing left for a
    // second path to show or for a badge to tell apart.
    showExact(drawn) {
      return drivingNatively() && !editing ? false : preview.showExact(drawn);
    },
    clearExact() {
      preview.clearExact();
    },
    isExact() {
      return drivingNatively() && !editing ? false : preview.isExact();
    },

    zoomIn(cursor) {
      return this.zoomTo(viewport.zoom * GEO.ZOOM_STEP, cursor);
    },

    zoomOut(cursor) {
      return this.zoomTo(viewport.zoom / GEO.ZOOM_STEP, cursor);
    },

    /** `cursor` is a point inside the stage box, which is what the page's
     *  wheel handler measures against the stage element. */
    zoomTo(zoom, cursor) {
      if (!drivingNatively()) return false;
      const box = stageBox();
      if (!GEO.isDrawable(box)) return false;
      const at = cursor || { x: box.width / 2, y: box.height / 2 };
      viewport = GEO.zoomViewport(viewport, box, at, zoom);
      place();
      return true;
    },

    fit() {
      if (!drivingNatively()) return false;
      viewport = GEO.fittedViewport();
      place();
      return true;
    },

    panBy(dx, dy) {
      if (!drivingNatively() || viewport.zoom <= GEO.FIT_ZOOM) return false;
      const box = stageBox();
      if (!GEO.isDrawable(box)) return false;
      const next = GEO.clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy }, box);
      if (next.x === viewport.x && next.y === viewport.y) return false;
      viewport = next;
      place();
      return true;
    },

    zoomState() {
      return { ...viewport, available: drivingNatively() };
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMonitor, readChoice, shouldShowMonitor };
} else {
  globalThis.monitorLib = { createMonitor, readChoice, shouldShowMonitor };
}
})();
