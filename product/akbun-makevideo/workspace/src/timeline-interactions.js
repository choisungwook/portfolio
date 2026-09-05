'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.timelineInteractionsLib = exported;
})(globalThis, function () {
  function horizontalWheelDelta(event) {
    if (!event.shiftKey) return 0;
    return event.deltaY || event.deltaX || 0;
  }

  function createTimelineInteractions(deps) {
    const {
      HANDLE_PX,
      L,
      api,
      baseName,
      dom,
      edit,
      frameAtClientX,
      getPreview,
      getSourceDrag,
      hydrateDuration,
      insertSourceAt,
      probePaths,
      rate,
      renderTimeline,
      selectAsset,
      selectClip,
      selectVisualItem,
      snapTolerance,
      syncEditorOverlay,
      addText,
      addShape,
      state,
    } = deps;

    // --- dragging clips --------------------------------------------------------

    let drag = null;
    const clipDragMetrics = {
      nextFrameMs: null,
      peakNextFrameMs: null,
      firstMoveQueueMs: null,
      peakFirstMoveQueueMs: null,
    };

    function measureClipDragNextFrame(startedAt) {
      window.requestAnimationFrame(() => {
        const elapsed = Math.max(0, performance.now() - startedAt);
        clipDragMetrics.nextFrameMs = elapsed;
        clipDragMetrics.peakNextFrameMs = Math.max(clipDragMetrics.peakNextFrameMs || 0, elapsed);
      });
    }

    function measureFirstClipMove(current, event) {
      if (current.firstMoveMeasured) return;
      current.firstMoveMeasured = true;
      const handledAt = performance.now();
      let queuedAt = Number(event.timeStamp);
      if (queuedAt > handledAt && Number.isFinite(performance.timeOrigin)) {
        queuedAt -= performance.timeOrigin;
      }
      if (!Number.isFinite(queuedAt) || queuedAt < 0 || queuedAt > handledAt) return;
      const elapsed = handledAt - queuedAt;
      clipDragMetrics.firstMoveQueueMs = elapsed;
      clipDragMetrics.peakFirstMoveQueueMs = Math.max(
        clipDragMetrics.peakFirstMoveQueueMs || 0,
        elapsed,
      );
    }

    function clipDragLanes() {
      return [...dom.lanes.querySelectorAll('.lane')].map((node) => {
        const box = node.getBoundingClientRect();
        return { node, top: box.top, bottom: box.bottom };
      });
    }

    function beginClipDrag(event, node) {
      const startedAt = performance.now();
      const clipId = node.dataset.clipId;
      const found = L.findClip(state.project, clipId);
      if (!found) return;
      const box = node.getBoundingClientRect();
      const offsetX = event.clientX - box.left;
      const mode =
        offsetX <= HANDLE_PX ? 'trim-start' : offsetX >= box.width - HANDLE_PX ? 'trim-end' : 'move';

      drag = {
        mode,
        clipId,
        node,
        grabFrames: L.pxToFrames(offsetX, rate(), state.pxPerSecond),
        startFrame: found.clip.start,
        endFrame: L.clipEnd(found.clip),
        durationFrames: L.clipDuration(found.clip),
        trackId: found.track.id,
        targetTrackId: found.track.id,
        nextStart: found.clip.start,
        nextEdge: found.clip.start,
        moved: false,
        lanes: clipDragLanes(),
        firstMoveMeasured: false,
        syncOverlayAfterEnd: false,
      };
      selectClip(clipId);
      document.body.classList.add(mode === 'move' ? 'dragging' : 'trimming');
      measureClipDragNextFrame(startedAt);
      event.preventDefault();
    }

    function updateClipDrag(event) {
      measureFirstClipMove(drag, event);
      const pointer = frameAtClientX(event.clientX);
      const tolerance = snapTolerance();

      if (drag.mode === 'move') {
        const wanted = Math.max(0, pointer - drag.grabFrames);
        drag.nextStart = L.snapClipStart(state.project, wanted, drag.durationFrames, tolerance, {
          exceptClipId: drag.clipId,
          extra: [getPreview().position()],
        });
        drag.node.style.left = `${L.framesToPx(drag.nextStart, rate(), state.pxPerSecond)}px`;

        // The lane under the pointer decides the target track, but only if it can
        // play this asset; otherwise the clip stays where it came from.
        const laneIndex = L.laneIndexAtY(drag.lanes, event.clientY);
        const lane = laneIndex >= 0 ? drag.lanes[laneIndex].node : null;
        const found = L.findClip(state.project, drag.clipId);
        const asset = found && L.findAsset(state.project, found.clip.assetId);
        const track = lane && L.findTrack(state.project, lane.dataset.trackId);
        for (const bound of drag.lanes) bound.node.classList.remove('drop-target');
        if (track && L.canAccept(track, asset)) {
          drag.targetTrackId = track.id;
          lane.classList.add('drop-target');
          if (drag.node.parentElement !== lane) lane.appendChild(drag.node);
        }
      } else {
        const snapped = L.snapTime(state.project, pointer, tolerance, {
          exceptClipId: drag.clipId,
          extra: [getPreview().position()],
        });
        const shortest = L.minClipFrames(rate());
        drag.nextEdge = snapped;
        if (drag.mode === 'trim-start') {
          const at = Math.min(snapped, drag.endFrame - shortest);
          drag.node.style.left = `${L.framesToPx(Math.max(0, at), rate(), state.pxPerSecond)}px`;
          drag.node.style.width = `${Math.max(2, L.framesToPx(drag.endFrame - at, rate(), state.pxPerSecond))}px`;
        } else {
          const at = Math.max(snapped, drag.startFrame + shortest);
          drag.node.style.width = `${Math.max(2, L.framesToPx(at - drag.startFrame, rate(), state.pxPerSecond))}px`;
        }
      }
      drag.moved = true;
    }

    /** The pointer came up, so the drag becomes a command. This is the only moment
     *  in a drag that Rust hears about, which is what keeps a mouse move off the
     *  IPC boundary. Rust may put the clip somewhere other than where it is being
     *  drawn — pushed right past a clip it would have overlapped — and the redraw
     *  is what settles it. */
    async function endClipDrag() {
      const current = drag;
      drag = null;
      document.body.classList.remove('dragging', 'trimming');
      for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
      if (!current) return;
      try {
        if (!current.moved) {
          renderTimeline();
          return;
        }
        return await edit(
          current.mode === 'move'
            ? {
                op: 'moveClip',
                clipId: current.clipId,
                trackId: current.targetTrackId,
                start: current.nextStart,
              }
            : {
                op: 'trimClip',
                clipId: current.clipId,
                edge: current.mode === 'trim-start' ? 'start' : 'end',
                frame: current.nextEdge,
              }
        );
      } finally {
        if (current.syncOverlayAfterEnd) syncEditorOverlay();
      }
    }

    // --- dragging text and shape layers on the timeline -------------------------

    let visualTimingDrag = null;

    function beginVisualItemDrag(event, node) {
      if (event.button !== 0) return;
      const found = L.findVisualItem(state.project, node.dataset.visualItemId);
      if (!found) return;
      selectVisualItem(found.item.id);
      const box = node.getBoundingClientRect();
      const offsetX = event.clientX - box.left;
      const mode =
        offsetX <= HANDLE_PX ? 'trim-start' : offsetX >= box.width - HANDLE_PX ? 'trim-end' : 'move';
      visualTimingDrag = {
        mode,
        itemId: found.item.id,
        node,
        grabFrames: L.pxToFrames(offsetX, rate(), state.pxPerSecond),
        nextStart: found.item.start,
        nextEnd: found.item.start + found.item.duration,
        moved: false,
      };
      document.body.classList.add(mode === 'move' ? 'dragging' : 'trimming');
      event.preventDefault();
    }

    function updateVisualItemDrag(event) {
      const current = visualTimingDrag;
      const pointer = frameAtClientX(event.clientX);
      const tolerance = snapTolerance();
      const duration = current.nextEnd - current.nextStart;
      if (current.mode === 'move') {
        const wanted = Math.max(0, pointer - current.grabFrames);
        current.nextStart = L.snapClipStart(state.project, wanted, duration, tolerance, {
          extra: [getPreview().position()],
        });
        current.nextEnd = current.nextStart + duration;
        current.node.style.left = `${L.framesToPx(current.nextStart, rate(), state.pxPerSecond)}px`;
      } else {
        const snapped = L.snapTime(state.project, pointer, tolerance, { extra: [getPreview().position()] });
        if (current.mode === 'trim-start') {
          current.nextStart = Math.max(0, Math.min(snapped, current.nextEnd - 1));
          current.node.style.left = `${L.framesToPx(current.nextStart, rate(), state.pxPerSecond)}px`;
        } else {
          current.nextEnd = Math.max(current.nextStart + 1, snapped);
        }
        const width = L.framesToPx(current.nextEnd - current.nextStart, rate(), state.pxPerSecond);
        current.node.style.width = `${Math.max(2, width)}px`;
      }
      current.moved = true;
    }

    function endVisualItemDrag() {
      const current = visualTimingDrag;
      visualTimingDrag = null;
      document.body.classList.remove('dragging', 'trimming');
      if (!current) return;
      if (!current.moved) {
        renderTimeline();
        return;
      }
      return edit({
        op: 'setVisualTiming',
        itemId: current.itemId,
        start: current.nextStart,
        duration: current.nextEnd - current.nextStart,
      });
    }

    // --- dragging the toolbar's Text and Shape buttons onto a track --------------

    let toolDrag = null;
    /** Set for the moment between a dragged release and the click the browser
     *  sends after it. Read and reset by the buttons' own click handlers. */
    let toolDragJustEnded = false;

    function tookToolDragClick() {
      const dragged = toolDragJustEnded;
      toolDragJustEnded = false;
      return dragged;
    }

    /** The + Text and + Shape buttons drag like assets do: pointer events, a
     *  ghost, and a lane that lights up. A plain click never grows a ghost, ends
     *  here doing nothing, and the button's own click handler adds the layer at
     *  the playhead as before. */
    function beginToolDrag(event, tool) {
      if (event.button !== 0) return;
      toolDrag = { tool, startX: event.clientX, startY: event.clientY, ghost: null };
    }

    /** Put the page back and report the drag, if it had got as far as a ghost.
     *
     *  Every way a drag can end comes through here — the pointer coming up, the
     *  sequence being cancelled, the window losing focus mid-drag — so a ghost is
     *  never left stuck to a cursor with no button held. Without it the next
     *  release over a lane would add a layer nobody asked for. */
    function clearToolDrag() {
      const current = toolDrag;
      toolDrag = null;
      if (!current || !current.ghost) return null;
      current.ghost.remove();
      document.body.classList.remove('dragging');
      for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
      return current;
    }

    function updateToolDrag(event) {
      if (!toolDrag.ghost) {
        const travelled =
          Math.abs(event.clientX - toolDrag.startX) + Math.abs(event.clientY - toolDrag.startY);
        if (travelled < 4) return;
        toolDrag.ghost = document.createElement('div');
        toolDrag.ghost.className = 'drag-ghost';
        toolDrag.ghost.textContent = toolDrag.tool.label;
        document.body.appendChild(toolDrag.ghost);
        document.body.classList.add('dragging');
      }
      toolDrag.ghost.style.left = `${event.clientX + 12}px`;
      toolDrag.ghost.style.top = `${event.clientY + 12}px`;
      const lane = laneAtPoint(event.clientX, event.clientY);
      const track = lane && L.findTrack(state.project, lane.dataset.trackId);
      const accepts = Boolean(track && track.kind === 'video');
      for (const node of dom.lanes.querySelectorAll('.lane')) {
        node.classList.toggle('drop-target', node === lane && accepts);
      }
    }

    async function endToolDrag(event) {
      const current = clearToolDrag();
      if (!current) return;
      // A drag that grew a ghost is never also a click, even when it ends back on
      // the button — the browser fires one anyway, and without this the cancelled
      // drag would add a layer at the playhead.
      toolDragJustEnded = true;
      const lane = laneAtPoint(event.clientX, event.clientY);
      const track = lane && L.findTrack(state.project, lane.dataset.trackId);
      if (!track || track.kind !== 'video') return;
      const frame = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
      if (current.tool.kind === 'text') await addText({ trackId: track.id, frame });
      else await addShape(current.tool.shape, { trackId: track.id, frame });
    }

    // --- scrubbing -------------------------------------------------------------

    let scrubbing = false;

    function scrubTo(clientX) {
      const tolerance = snapTolerance();
      getPreview().seek(L.snapTime(state.project, frameAtClientX(clientX), tolerance));
    }

    function beginScrub(event) {
      if (event.target.closest('[data-marker-id]')) return;
      scrubbing = true;
      getPreview().setScrubbing(true);
      scrubTo(event.clientX);
      event.preventDefault();
    }

    // --- dropping --------------------------------------------------------------

    /** One addClip per asset, all asking for the same frame.
     *
     *  They come out end to end rather than on top of each other because a clip
     *  never overlaps another one: the second lands after the first, the third
     *  after the second. The page does not have to work out where any of them go,
     *  which is exactly the arithmetic it no longer owns. */
    function dropCommands(trackId, assets, atFrame) {
      const track = L.findTrack(state.project, trackId);
      if (!track) return [];
      const commands = [];
      const accepted = assets.filter((asset) => L.canAccept(track, asset));
      if (track.kind === 'video') {
        const firstVideo = accepted.find((asset) => asset.kind === 'video');
        const settings = L.settingsForFirstVideo(state.project, firstVideo, {
          width: state.settings.defaultWidth,
          height: state.settings.defaultHeight,
        });
        if (settings) commands.push({ op: 'setSettings', settings });
      }
      for (const asset of accepted) {
        if (track.kind === 'video' && asset.kind === 'video' && asset.hasAudio) {
          const videoIndex = L.tracksOf(state.project, 'video').findIndex((item) => item.id === trackId);
          const audio = L.tracksOf(state.project, 'audio')[videoIndex];
          if (!audio) return null;
          const linkGroup = `g${crypto.randomUUID()}`;
          commands.push(
            { op: 'addClip', trackId, assetId: asset.id, start: atFrame, linkGroup },
            { op: 'addClip', trackId: audio.id, assetId: asset.id, start: atFrame, linkGroup }
          );
          continue;
        }
        commands.push({ op: 'addClip', trackId, assetId: asset.id, start: atFrame });
      }
      return commands;
    }

    function laneAtPoint(x, y) {
      const under = document.elementFromPoint(x, y);
      if (!under || !under.closest) return null;
      return under.closest('.lane');
    }

    function sourcePanelAtPoint(x, y) {
      const under = document.elementFromPoint(x, y);
      if (!under || !under.closest) return null;
      return under.closest('#source-panel');
    }

    function selectMadeOnTrack(made, trackId) {
      if (!made || !made.length) return;
      const selected = made.find((clipId) => {
        const found = L.findClip(state.project, clipId);
        return found && found.track.id === trackId;
      });
      selectClip(selected || made[0]);
    }

    /** Dragging an asset out of the panel and onto a lane runs on pointer events
     *  rather than HTML5 drag and drop.
     *
     *  The webview that shows this page is also the view that catches files dropped
     *  from Finder, and that handler reports every drag event as handled — including
     *  a drag that started inside the page and carries no file at all. WebKit never
     *  gets it, so `dragover` and `drop` do not fire and a `draggable` asset lands
     *  nowhere. Pointer events are not routed through it. */
    let assetDrag = null;
    let sourceDrag = null;

    function beginAssetDrag(event) {
      if (event.button !== 0) return;
      const item = event.target.closest('.asset');
      if (!item || event.target.closest('[data-remove]')) return;
      const asset = L.findAsset(state.project, item.dataset.id);
      if (!asset) return;
      assetDrag = { asset, startX: event.clientX, startY: event.clientY, ghost: null };
    }

    function updateAssetDrag(event) {
      if (!assetDrag) return;
      // A few pixels of slack, so a click that wobbles still reads as a click.
      if (!assetDrag.ghost) {
        const travelled =
          Math.abs(event.clientX - assetDrag.startX) + Math.abs(event.clientY - assetDrag.startY);
        if (travelled < 4) return;
        assetDrag.ghost = document.createElement('div');
        assetDrag.ghost.className = 'drag-ghost';
        assetDrag.ghost.textContent = assetDrag.asset.name || baseName(assetDrag.asset.path);
        document.body.appendChild(assetDrag.ghost);
        document.body.classList.add('dragging');
      }
      assetDrag.ghost.style.left = `${event.clientX + 12}px`;
      assetDrag.ghost.style.top = `${event.clientY + 12}px`;
      const lane = laneAtPoint(event.clientX, event.clientY);
      const sourcePanel = sourcePanelAtPoint(event.clientX, event.clientY);
      for (const node of dom.lanes.querySelectorAll('.lane')) {
        node.classList.toggle('drop-target', node === lane);
      }
      dom.sourcePanel.classList.toggle('drop-target', Boolean(sourcePanel) && !lane);
    }

    /** Put the page back the way it was and report the drag that was running, if it
     *  had got as far as showing a ghost.
     *
     *  A drag does not always end in a pointerup: the pointer sequence can be
     *  cancelled, or the window can lose focus mid-drag and the button come up
     *  somewhere else entirely. Every one of those paths comes through here, so a
     *  ghost is never left stuck to the cursor. */
    function clearAssetDrag() {
      const current = assetDrag;
      assetDrag = null;
      if (!current || !current.ghost) return null;
      current.ghost.remove();
      document.body.classList.remove('dragging');
      for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
      dom.sourcePanel.classList.remove('drop-target');
      return current;
    }

    async function endAssetDrag(event) {
      const current = clearAssetDrag();
      if (!current) return;

      const lane = laneAtPoint(event.clientX, event.clientY);
      if (sourcePanelAtPoint(event.clientX, event.clientY)) {
        selectAsset(current.asset.id);
        return;
      }
      if (!lane) return;
      const at = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
      const commands = dropCommands(lane.dataset.trackId, [current.asset], at);
      if (!commands) {
        await api.message('Add the matching audio track before placing this video.', {
          title: 'Linked clip needs an audio track',
        });
        return;
      }
      const made = await edit(...commands);
      selectMadeOnTrack(made, lane.dataset.trackId);
    }

    function sourceLaneAtPoint(source, x, y) {
      const lane = laneAtPoint(x, y);
      const track = lane && L.findTrack(state.project, lane.dataset.trackId);
      if (!track || !L.canAccept(track, source.asset)) return null;
      if (track.kind === 'video' && !source.video) return null;
      if (track.kind === 'audio' && !source.audio) return null;
      return lane;
    }

    function beginSourceDrag(event) {
      if (event.button !== 0) return;
      const source = getSourceDrag();
      if (!source) return;
      sourceDrag = {
        source,
        startX: event.clientX,
        startY: event.clientY,
        ghost: null,
      };
      event.preventDefault();
    }

    function updateSourceDrag(event) {
      if (!sourceDrag) return;
      if (!sourceDrag.ghost) {
        const travelled =
          Math.abs(event.clientX - sourceDrag.startX) + Math.abs(event.clientY - sourceDrag.startY);
        if (travelled < 4) return;
        sourceDrag.ghost = document.createElement('div');
        sourceDrag.ghost.className = 'drag-ghost';
        sourceDrag.ghost.textContent = sourceDrag.source.asset.name || baseName(sourceDrag.source.asset.path);
        document.body.appendChild(sourceDrag.ghost);
        document.body.classList.add('dragging');
      }
      sourceDrag.ghost.style.left = `${event.clientX + 12}px`;
      sourceDrag.ghost.style.top = `${event.clientY + 12}px`;
      const lane = sourceLaneAtPoint(sourceDrag.source, event.clientX, event.clientY);
      for (const node of dom.lanes.querySelectorAll('.lane')) {
        node.classList.toggle('drop-target', node === lane);
      }
    }

    function clearSourceDrag() {
      const current = sourceDrag;
      sourceDrag = null;
      if (!current || !current.ghost) return null;
      current.ghost.remove();
      document.body.classList.remove('dragging');
      for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
      return current;
    }

    async function endSourceDrag(event) {
      const current = clearSourceDrag();
      if (!current) return;
      const lane = sourceLaneAtPoint(current.source, event.clientX, event.clientY);
      if (!lane) return;
      const frame = L.snapTime(state.project, frameAtClientX(event.clientX), snapTolerance());
      await insertSourceAt(current.source, lane.dataset.trackId, frame);
    }

    async function handleOsDrop(payload) {
      if (payload.type === 'over') {
        const point = payload.position || { x: 0, y: 0 };
        const ratio = window.devicePixelRatio || 1;
        const lane = laneAtPoint(point.x / ratio, point.y / ratio);
        const sourcePanel = sourcePanelAtPoint(point.x / ratio, point.y / ratio);
        for (const node of dom.lanes.querySelectorAll('.lane')) {
          node.classList.toggle('drop-target', node === lane);
        }
        dom.sourcePanel.classList.toggle('drop-target', Boolean(sourcePanel) && !lane);
        dom.assetsPanel.classList.toggle('drop-target', !lane && !sourcePanel);
        return;
      }
      for (const node of dom.lanes.querySelectorAll('.lane')) node.classList.remove('drop-target');
      dom.assetsPanel.classList.remove('drop-target');
      dom.sourcePanel.classList.remove('drop-target');
      if (payload.type !== 'drop') return;

      // The event carries physical pixels; elementFromPoint wants CSS pixels.
      const point = payload.position || { x: 0, y: 0 };
      const ratio = window.devicePixelRatio || 1;
      const x = point.x / ratio;
      const y = point.y / ratio;
      const lane = laneAtPoint(x, y);
      const sourcePanel = sourcePanelAtPoint(x, y);

      const found = await probePaths(payload.paths || []);
      if (!found.length) return;
      // The import and the clips it turns into are one thing the user did, so they
      // go over as one transaction and come back on one press of undo.
      const at = L.snapTime(state.project, frameAtClientX(x), snapTolerance());
      const commands = lane ? dropCommands(lane.dataset.trackId, found, at) : [];
      if (lane && !commands) {
        await api.message('Add the matching audio track before placing this video.', {
          title: 'Linked clip needs an audio track',
        });
        return;
      }
      const made = await edit(
        { op: 'addAssets', assets: found },
        ...commands
      );
      if (sourcePanel) selectAsset(found[0].id);
      else if (lane) selectMadeOnTrack(made, lane.dataset.trackId);
      for (const asset of found) hydrateDuration(asset);
    }


    function deferOverlaySync() {
      if (!drag) return false;
      drag.syncOverlayAfterEnd = true;
      return true;
    }

    function pointerMove(event) {
      if (drag) updateClipDrag(event);
      else if (visualTimingDrag) updateVisualItemDrag(event);
      else if (toolDrag) updateToolDrag(event);
      else if (scrubbing) scrubTo(event.clientX);
    }

    function pointerUp(event, reportError) {
      if (drag) endClipDrag().catch((error) => reportError(error, 'clip:drag'));
      if (visualTimingDrag) Promise.resolve(endVisualItemDrag()).catch((error) => reportError(error, 'visual-item:timing'));
      if (toolDrag) endToolDrag(event).catch((error) => reportError(error, 'tool-drop'));
      if (scrubbing) {
        scrubbing = false;
        getPreview().setScrubbing(false);
      }
    }

    function scrollHorizontally(event) {
      const delta = horizontalWheelDelta(event);
      if (!delta) return;
      dom.scroll.scrollLeft += delta;
      event.preventDefault();
    }

    return {
      beginAssetDrag,
      beginClipDrag,
      beginScrub,
      beginSourceDrag,
      beginToolDrag,
      beginVisualItemDrag,
      clearAssetDrag,
      clearSourceDrag,
      clearToolDrag,
      deferOverlaySync,
      endAssetDrag,
      endSourceDrag,
      handleOsDrop,
      metrics: clipDragMetrics,
      pointerMove,
      pointerUp,
      scrollHorizontally,
      tookToolDragClick,
      updateAssetDrag,
      updateSourceDrag,
    };
  }

  return { createTimelineInteractions, horizontalWheelDelta };
});
