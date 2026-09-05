'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.rendererTimelineUiLib = exported;
})(globalThis, function () {
  function createRendererTimelineUi(deps) {
    const {
      L,
      T,
      S,
      P,
      state,
      dom,
      el,
      baseName,
      rate,
      displayTracks,
      contentFrames,
      edit,
      adopt,
      reportError,
    } = deps;
    let preview = null;
    let sourcePreview = null;
    let stageController = null;
    let inspectorController = null;
    const playbackPath = (...args) => deps.playbackPath(...args);
    const renderAssets = (...args) => deps.renderAssets(...args);
    const renderSourceMonitor = (...args) => deps.renderSourceMonitor(...args);
    const updateTitle = (...args) => deps.updateTitle(...args);
    const prepareDerivedMedia = (...args) => deps.prepareDerivedMedia(...args);
    const persistSettingsInBackground = (...args) => deps.persistSettingsInBackground(...args);

    function setRuntime(runtime) {
      if (Object.hasOwn(runtime, 'preview')) preview = runtime.preview;
      if (Object.hasOwn(runtime, 'sourcePreview')) sourcePreview = runtime.sourcePreview;
      if (Object.hasOwn(runtime, 'stageController')) stageController = runtime.stageController;
      if (Object.hasOwn(runtime, 'inspectorController')) inspectorController = runtime.inspectorController;
    }

    // --- timeline --------------------------------------------------------------

    function renderHeads() {
      dom.heads.textContent = '';
      const spacer = document.createElement('div');
      spacer.className = 'ruler-spacer';
      dom.heads.appendChild(spacer);

      for (const track of displayTracks()) {
        const head = document.createElement('div');
        head.className = `head ${track.kind}`;
        head.dataset.trackId = track.id;

        const name = document.createElement('span');
        name.className = 'head-name';
        name.textContent = track.name;

        const buttons = document.createElement('span');
        buttons.className = 'head-buttons';
        const target = document.createElement('button');
        target.dataset.targetTrack = track.id;
        target.textContent = 'target';
        target.title = 'Use only this track for previous and next edit navigation';
        target.className = track.id === state.targetTrackId ? 'target on' : 'target';
        buttons.appendChild(target);
        if (track.kind === 'video' || track.kind === 'subtitle') {
          const hide = document.createElement('button');
          hide.dataset.toggle = 'hidden';
          hide.textContent = 'hide';
          hide.title = 'Hide this track from the preview and the render';
          hide.className = track.hidden ? 'on' : '';
          buttons.appendChild(hide);
        }
        const mute = document.createElement('button');
        mute.dataset.toggle = 'muted';
        mute.textContent = 'mute';
        mute.title = 'Silence this track';
        mute.className = track.muted ? 'on' : '';
        buttons.appendChild(mute);

        head.append(name, buttons);
        dom.heads.appendChild(head);
      }
    }

    function clipElement(track, clip) {
      const asset = L.findAsset(state.project, clip.assetId);
      const node = document.createElement('div');
      node.className = `clip ${track.kind}`;
      node.dataset.clipId = clip.id;
      node.style.left = `${L.framesToPx(clip.start, rate(), state.pxPerSecond)}px`;
      const width = Math.max(2, L.framesToPx(L.clipDuration(clip), rate(), state.pxPerSecond));
      node.style.width = `${width}px`;
      if (clip.id === state.selectedClipId) node.classList.add('selected');
      if (clip.linkGroup) {
        node.classList.add('linked');
        node.title = 'Linked audio and video clip';
      }
      if (clip.lutPath) {
        const unavailable = state.lutStatus[clip.lutPath] === 'unavailable';
        node.classList.add('lut');
        node.classList.toggle('lut-unavailable', unavailable);
        const lutTitle = unavailable
          ? `3D LUT unavailable: ${baseName(clip.lutPath)}`
          : `3D LUT: ${baseName(clip.lutPath)}`;
        node.title = node.title ? `${node.title}; ${lutTitle}` : lutTitle;
      }

      const label = document.createElement('span');
      label.className = 'clip-name';
      label.textContent = asset ? asset.name || baseName(asset.path) : 'missing file';
      if (!asset) node.classList.add('missing');
      const left = document.createElement('span');
      left.className = 'handle left';
      const right = document.createElement('span');
      right.className = 'handle right';
      if (track.kind === 'audio' && asset) {
        const waveform = state.waveforms[asset.id];
        if (waveform && waveform.state === 'ready' && waveform.peaks.length) {
          const canvas = document.createElement('canvas');
          canvas.className = 'clip-waveform';
          drawWaveform(canvas, clip, waveform, width);
          node.appendChild(canvas);
        }
      }
      node.append(left, label, right);
      for (const key of (clip.volumeKeyframes && clip.volumeKeyframes.keyframes) || []) {
        node.appendChild(keyframeDot('volume', clip.id, 'volume', key, clip.start, width, 0));
      }
      return node;
    }

    function keyframeDot(type, layerId, property, key, start, width, row) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'keyframe-dot';
      node.dataset.keyframeType = type;
      node.dataset.layerId = layerId;
      node.dataset.keyframeProperty = property;
      node.dataset.keyframeFrame = String(key.frame);
      node.dataset.keyframeValue = String(key.value);
      node.dataset.keyframeEasing = key.easing || 'linear';
      node.style.left = `${Math.max(0, Math.min(width, L.framesToPx(key.frame - start, rate(), state.pxPerSecond)))}px`;
      node.style.top = `${4 + row * 5}px`;
      node.title = `${property} · ${key.frame}`;
      return node;
    }

    /** A text, shape or subtitle layer as a timeline element. The same element
     *  shape as a clip — left edge, name, trim handles — so a layer moves and
     *  trims the way a clip does. */
    function visualElement(track, item) {
      const node = document.createElement('div');
      // A project should always contain content, but keep an incomplete saved
      // visual item from taking down the whole timeline while it is repaired.
      const content = item.content || {};
      const kind = content.kind === 'shape'
        ? 'shape'
        : content.kind === 'adjustment'
          ? 'adjustment'
          : content.kind === 'videoOverlay'
            ? 'pip'
            : 'text';
      node.className = track.kind === 'subtitle' ? 'clip subtitle' : `clip visual ${kind}`;
      node.dataset.visualItemId = item.id;
      node.style.left = `${L.framesToPx(item.start, rate(), state.pxPerSecond)}px`;
      node.style.width = `${Math.max(2, L.framesToPx(item.duration, rate(), state.pxPerSecond))}px`;
      if (item.id === state.selectedVisualItemId) node.classList.add('selected');
      const label = document.createElement('span');
      label.className = 'clip-name';
      label.textContent = kind === 'shape'
        ? `Shape — ${content.shape || 'rectangle'}`
        : kind === 'adjustment'
          ? `Adjustment — ${baseName(content.lutPath || '')}`
          : kind === 'pip'
            ? `PIP — ${(L.findAsset(state.project, content.assetId) || {}).name || 'Video'}`
          : content.text || (track.kind === 'subtitle' ? 'Subtitle' : 'Text');
      const left = document.createElement('span');
      left.className = 'handle left';
      const right = document.createElement('span');
      right.className = 'handle right';
      node.append(left, label, right);
      const properties = ['x', 'y', 'width', 'height', 'rotation', 'opacity'];
      for (const [row, property] of properties.entries()) {
        const keys = item.animation && item.animation[property] && item.animation[property].keyframes;
        for (const key of keys || []) {
          node.appendChild(keyframeDot('visual', item.id, property, key, item.start, parseFloat(node.style.width), row));
        }
      }
      return node;
    }

    function transitionElement(transition) {
      const incoming = L.findClip(state.project, transition.toClipId);
      if (!incoming) return null;
      const node = document.createElement('div');
      node.className = 'timeline-transition';
      node.dataset.transitionId = transition.id;
      node.style.left = `${L.framesToPx(incoming.clip.start - transition.duration, rate(), state.pxPerSecond)}px`;
      node.style.width = `${Math.max(4, L.framesToPx(transition.duration, rate(), state.pxPerSecond))}px`;
      node.title = `Dissolve · ${transition.duration} frames`;
      node.textContent = 'Dissolve';
      return node;
    }

    function drawWaveform(canvas, clip, waveform, cssWidth) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.min(4096, Math.ceil(cssWidth * ratio)));
      const height = Math.ceil(32 * ratio);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      const { first, last } = L.waveformBucketRange(clip, rate(), waveform.bucketsPerSecond);
      const span = Math.max(1, last - first);
      context.strokeStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--waveform')
        .trim() || '#205f42';
      context.lineWidth = Math.max(1, ratio);
      context.beginPath();
      for (let x = 0; x < width; x += 1) {
        const from = Math.min(
          waveform.peaks.length - 1,
          Math.max(0, Math.floor(first + (x / width) * span))
        );
        const to = Math.min(
          waveform.peaks.length,
          Math.max(from + 1, Math.ceil(first + ((x + 1) / width) * span))
        );
        let [min, max] = waveform.peaks[from];
        for (let index = from + 1; index < to; index += 1) {
          min = Math.min(min, waveform.peaks[index][0]);
          max = Math.max(max, waveform.peaks[index][1]);
        }
        context.moveTo(x + 0.5, ((1 - max) * height) / 2);
        context.lineTo(x + 0.5, ((1 - min) * height) / 2);
      }
      context.stroke();
    }

    function renderLanes() {
      dom.lanes.textContent = '';
      const width = L.framesToPx(contentFrames(), rate(), state.pxPerSecond);
      dom.content.style.width = `${width}px`;

      for (const track of displayTracks()) {
        const lane = document.createElement('div');
        lane.className = `lane ${track.kind}`;
        lane.dataset.trackId = track.id;
        if (track.hidden) lane.classList.add('off');
        if (track.muted) lane.classList.add('muted');
        if (track.kind === 'subtitle') {
          for (const item of track.visualItems || []) lane.appendChild(visualElement(track, item));
        } else {
          for (const clip of track.clips) lane.appendChild(clipElement(track, clip));
          for (const transition of (state.project.transitions || []).filter((entry) => entry.trackId === track.id)) {
            const node = transitionElement(transition);
            if (node) lane.appendChild(node);
          }
          // Text and shape layers ride on video tracks beside the clips. Without
          // an element here they exist only on the stage, which is how a layer
          // ends up impossible to move, trim or delete.
          for (const item of track.visualItems || []) lane.appendChild(visualElement(track, item));
        }
        dom.lanes.appendChild(lane);
      }
    }

    function renderRuler() {
      dom.ruler.textContent = '';
      const total = contentFrames();
      const step = L.tickStepFrames(state.pxPerSecond, rate());
      const fragment = document.createDocumentFragment();
      for (let frame = 0; frame <= total; frame += step) {
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = `${L.framesToPx(frame, rate(), state.pxPerSecond)}px`;
        tick.textContent = L.formatRulerLabel(frame, rate());
        fragment.appendChild(tick);
      }
      dom.ruler.appendChild(fragment);
      for (const marker of state.project.markers || []) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'marker';
        node.dataset.markerId = marker.id;
        node.style.left = `${L.framesToPx(marker.frame, rate(), state.pxPerSecond)}px`;
        node.style.color = marker.color;
        node.title = marker.name || L.formatTimecode(marker.frame, rate());
        dom.ruler.appendChild(node);
      }
    }

    function renderMarkerList() {
      dom.markerList.textContent = '';
      const markers = P.orderedMarkers(state.project.markers);
      dom.markerEmpty.hidden = markers.length > 0;
      for (const marker of markers) {
        const row = document.createElement('div');
        row.className = 'marker-row';
        const seek = document.createElement('button');
        seek.type = 'button';
        seek.dataset.markerSeek = marker.id;
        seek.textContent = L.formatTimecode(marker.frame, rate());
        const color = document.createElement('input');
        color.type = 'color';
        color.value = marker.color;
        color.dataset.markerColor = marker.id;
        const name = document.createElement('input');
        name.type = 'text';
        name.value = marker.name;
        name.placeholder = 'Marker name';
        name.dataset.markerName = marker.id;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.markerRemove = marker.id;
        remove.textContent = 'Delete';
        row.append(seek, color, name, remove);
        dom.markerList.appendChild(row);
      }
    }

    /** The two menu items that are only sometimes there to press, and what they
     *  say they will take back. */
    function updateHistoryUi() {
      const doc = state.doc || { canUndo: false, canRedo: false, undoLabel: '', redoLabel: '' };
      const undo = el('menu-undo');
      const redo = el('menu-redo');
      if (!undo || !redo) return;
      undo.disabled = !doc.canUndo;
      redo.disabled = !doc.canRedo;
      undo.firstChild.textContent = doc.canUndo ? `Undo ${doc.undoLabel}` : 'Undo';
      redo.firstChild.textContent = doc.canRedo ? `Redo ${doc.redoLabel}` : 'Redo';
    }

    function updateMonitorZoomUi() {
      const zoom = preview && preview.zoomState ? preview.zoomState() : { zoom: 1, available: false };
      el('menu-monitor-zoom-in').disabled = !zoom.available || zoom.zoom >= 4;
      el('menu-monitor-zoom-out').disabled = !zoom.available || zoom.zoom <= 1;
      el('menu-monitor-fit').disabled = !zoom.available || zoom.zoom === 1;
    }

    function renderTimeline() {
      if (state.selectedVisualItemId && !stageController.selectedVisualItem()) stageController.selectVisualItem(null);
      renderHeads();
      renderRuler();
      renderLanes();
      renderMarkerList();
      inspectorController.render();
      updatePlayhead(preview ? preview.position() : 0);
      dom.duration.textContent = L.formatTimecode(L.projectDurationFrames(state.project), rate());
      dom.btnMagnet.classList.toggle('on', Boolean(state.settings && state.settings.snap));
      dom.btnAddVideo.disabled = L.tracksOf(state.project, 'video').length >= L.MAX_TRACKS_PER_KIND;
      dom.btnAddAudio.disabled = L.tracksOf(state.project, 'audio').length >= L.MAX_TRACKS_PER_KIND;
      dom.btnAddSubtitle.disabled = L.tracksOf(state.project, 'subtitle').length >= 1;
      updateLinkUi();
      updateHistoryUi();
      updateMonitorZoomUi();
      stageController.renderStageOverlay();
      stageController.scheduleExactFrame();
      if (preview) preview.redraw();
    }

    function checkLutFiles() {
      const paths = new Set();
      for (const track of state.project.tracks) {
        for (const clip of track.clips) {
          const path = clip.lutPath;
          if (path) paths.add(path);
        }
      }
      for (const path of Object.keys(state.lutStatus)) {
        if (!paths.has(path)) delete state.lutStatus[path];
      }
      for (const path of paths) {
        if (state.lutStatus[path]) continue;
          state.lutStatus[path] = 'checking';
          window.api.validateLut(path)
            .then(() => { state.lutStatus[path] = 'ready'; renderTimeline(); })
            .catch(() => { state.lutStatus[path] = 'unavailable'; renderTimeline(); });
      }
    }

    function refresh() {
      renderAssets();
      renderSourceMonitor();
      renderTimeline();
      checkLutFiles();
      el('menu-delete-project').disabled = !state.path;
      if (preview) {
        preview.prune();
        preview.layout();
      }
      if (sourcePreview) sourcePreview.layout();
      updateTitle();
    }

    function updatePlayhead(frame) {
      dom.playhead.style.left = `${L.framesToPx(frame, rate(), state.pxPerSecond)}px`;
      dom.clock.textContent = L.formatTimecode(frame, rate());
      dom.stageHint.hidden = L.projectDurationFrames(state.project) > 0 || preview.mode() === 'asset';
      stageController.syncEditorOverlay();
      stageController.renderStageOverlay();
      stageController.drawStageVisuals();
    }

    function seekPreviousEdit() {
      const point = L.previousEditPoint(state.project, preview.position(), state.targetTrackId);
      if (point !== null) preview.seek(point);
    }

    function seekNextEdit() {
      const point = L.nextEditPoint(state.project, preview.position(), state.targetTrackId);
      if (point !== null) preview.seek(point);
    }

    function seekTimelineStart() {
      preview.seek(0);
    }

    function seekTimelineEnd() {
      preview.seek(L.projectDurationFrames(state.project));
    }

    function seekTimelineOffset(offset) {
      preview.seek(Math.round(preview.position()) + offset);
    }

    /** Keep the playhead on screen while it runs, without fighting a user who is
     *  scrolling somewhere else. */
    function followPlayhead(frame) {
      if (!preview.isPlaying()) return;
      const x = L.framesToPx(frame, rate(), state.pxPerSecond);
      const left = dom.scroll.scrollLeft;
      const right = left + dom.scroll.clientWidth;
      if (x < left || x > right - 40) dom.scroll.scrollLeft = Math.max(0, x - dom.scroll.clientWidth * 0.3);
    }

    function closeTimelineContextMenu() {
      if (!dom.timelineContextMenu) return;
      dom.timelineContextMenu.hidden = true;
      dom.timelineContextMenu.textContent = '';
    }

    /** The desktop application's menu is part of the page, like the menu bar.
     *  This keeps the target and the action in one event flow and never exposes
     *  the webview's Reload menu over unsaved edits. */
    function openTimelineContextMenu(event, items) {
      const menu = dom.timelineContextMenu;
      if (!menu || !items.length) return;
      menu.textContent = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.addEventListener('click', () => {
          closeTimelineContextMenu();
          Promise.resolve().then(() => item.run()).catch((error) => reportError(error, `timeline-menu:${item.label}`));
        });
        menu.appendChild(button);
      }
      menu.hidden = false;
      const box = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(event.clientX, window.innerWidth - box.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(event.clientY, window.innerHeight - box.height - 4))}px`;
    }

    function updateLinkUi() {
      const selected = liveSelection();
      const found = selected && L.findClip(state.project, selected);
      dom.btnLink.disabled = !found || (!found.clip.linkGroup && !L.relinkCandidate(state.project, selected));
      dom.btnLink.textContent = found && found.clip.linkGroup ? 'Unlink Clips' : 'Link Clips';
    }

    function selectAsset(assetId) {
      state.selectedAssetId = assetId;
      const asset = L.findAsset(state.project, assetId);
      state.sourceSelection = asset ? S.selectionFor(asset, rate()) : null;
      dom.sourceVideo.checked = Boolean(asset) && (asset.kind === 'video' || asset.kind === 'image');
      dom.sourceAudio.checked = Boolean(asset) &&
        (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio));
      if (sourcePreview) sourcePreview.showAsset(asset);
      renderAssets();
      renderSourceMonitor();
      inspectorController.render();
    }

    /** The selection is an id, and clips go away underneath it: opening a project,
     *  or removing an asset, takes its clips with it. A stale id would make Split
     *  quietly cut nothing at all, so every reader of the selection goes through
     *  here and a dead one is dropped on the spot. */
    function liveSelection() {
      if (!state.selectedClipId) return null;
      if (L.findClip(state.project, state.selectedClipId)) return state.selectedClipId;
      state.selectedClipId = null;
      return null;
    }

    function splitAtPlayhead() {
      return edit({
        op: 'splitAt',
        frame: Math.round(preview.position()),
        clipId: liveSelection(),
      });
    }

    function addMarker(frame = Math.round(preview.position())) {
      return edit({ op: 'addMarker', frame, name: '', color: '#e6a700' });
    }

    /** A drag names its destination. A click does not: Rust then reuses a
     *  clip-free top overlay track, creates one, or falls back at the track cap. */
    function visualTargetTrack(placement) {
      if (!placement) return null;
      const track = L.findTrack(state.project, placement.trackId);
      return track && track.kind === 'video' ? track : null;
    }

    /** Add a visual item and select what Rust made of it. `placement` is
     *  `{ trackId, frame }` from a drop; without one Rust chooses the top overlay
     *  track at the playhead. */
    async function addVisualItem(placement, content, transform, duration = L.defaultVisualItemFrames(rate())) {
      const track = visualTargetTrack(placement);
      if (placement && !track) return;
      const known = new Set();
      for (const candidate of state.project.tracks) {
        for (const item of candidate.visualItems || []) known.add(item.id);
      }
      const videos = L.tracksOf(state.project, 'video');
      const top = videos[videos.length - 1];
      const reusable = top && !top.clips.length && (top.visualItems || []).every((item) =>
        item.content && (item.content.kind === 'text' || item.content.kind === 'shape'));
      const atLimit = !placement && videos.length >= L.MAX_TRACKS_PER_KIND && !reusable;
      const command = {
        op: placement ? 'addVisualItem' : 'addOverlayVisualItem',
        ...(placement ? { trackId: track.id } : {}),
        content,
        start: placement ? Math.round(placement.frame) : Math.round(preview.position()),
        duration,
        transform: { ...transform, rotation: 0, opacity: 1 },
        zIndex: 0,
      };
      const done = await edit(command);
      if (done === null) return;
      let item = null;
      for (const candidate of state.project.tracks) {
        item = (candidate.visualItems || []).find((entry) => !known.has(entry.id));
        if (item) break;
      }
      if (item) stageController.selectVisualItem(item.id);
      if (atLimit) {
        await window.api.message(
          `The ${L.MAX_TRACKS_PER_KIND}-video-track limit was reached. The layer was added to the top video track.`,
          { title: 'Layer added to existing track', kind: 'warning' },
        );
      }
    }

    async function addPip() {
      const asset = L.findAsset(state.project, state.selectedAssetId);
      const selection = state.sourceSelection;
      if (!asset || asset.kind !== 'video' || !selection) return;
      const width = state.project.settings.width * 0.32;
      const height = width * (asset.height || 9) / (asset.width || 16);
      await addVisualItem(null, {
        kind: 'videoOverlay',
        assetId: asset.id,
        inPoint: selection.inPoint,
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cornerRadius: 24,
        border: { color: '#ffffff', width: 4 },
        audioEnabled: Boolean(dom.sourceAudio.checked && asset.hasAudio),
      }, {
        x: state.project.settings.width - width - state.project.settings.width * 0.05,
        y: state.project.settings.height - height - state.project.settings.height * 0.05,
        width,
        height,
      }, Math.max(1, selection.outPoint - selection.inPoint));
      const item = stageController.selectedVisualItem();
      if (item && L.videoSourceCountAt(state.project, item.start) > L.MAX_REALTIME_VIDEO_SOURCES) {
        await window.api.message(
          `More than ${L.MAX_REALTIME_VIDEO_SOURCES} video sources overlap here. Preview may drop frames; export remains exact.`,
          { title: 'Playback budget exceeded', kind: 'warning' },
        );
      }
    }

    function addText(placement) {
      return addVisualItem(placement, {
        kind: 'text',
        text: 'Title',
        style: {
          fontFamily: 'sans-serif', fontSize: 64, align: 'center',
          fills: [{ kind: 'solid', color: '#ffffff' }],
          stroke: null,
          shadow: { color: '#00000080', x: 2, y: 2, blur: 0 },
        },
      }, {
        x: state.project.settings.width * 0.1,
        y: state.project.settings.height * 0.12,
        width: state.project.settings.width * 0.8,
        height: state.project.settings.height * 0.2,
      });
    }

    function shapeTransform(shape) {
      const square = shape === 'ellipse' || shape === 'polygon' || shape === 'star';
      const line = shape === 'line';
      const width = state.project.settings.width * 0.4;
      const height = state.project.settings.height * (line ? 0.08 : square ? 0.35 : 0.25);
      return {
        x: (state.project.settings.width - width) / 2,
        y: (state.project.settings.height - height) / 2,
        width,
        height,
      };
    }

    function addShape(shape, placement) {
      return addVisualItem(placement, {
        kind: 'shape', shape,
        fills: [{ kind: 'solid', color: '#4f8cffcc' }],
        stroke: { color: '#ffffff', width: 4 }, shadow: null,
        cornerRadius: shape === 'roundedRectangle' ? 20 : 0,
        startArrow: false,
        endArrow: false,
      }, shapeTransform(shape));
    }

    async function addSubtitle() {
      const track = L.tracksOf(state.project, 'subtitle')[0];
      if (!track) return;
      const start = Math.round(preview.position());
      const duration = Math.max(1, Math.round(T.rateToNumber(rate()) * 2));
      const known = new Set((track.visualItems || []).map((item) => item.id));
      await edit({
        op: 'addVisualItem',
        trackId: track.id,
        content: { kind: 'text', text: 'Subtitle', style: {} },
        start,
        duration,
        transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1 },
        zIndex: 0,
      });
      const item = (L.findTrack(state.project, track.id).visualItems || []).find((entry) => !known.has(entry.id));
      if (item) stageController.selectVisualItem(item.id);
    }

    async function importSrt() {
      const track = L.tracksOf(state.project, 'subtitle')[0];
      if (!track) return;
      const path = await window.api.pickSrtOpen();
      if (!path) return;
      adopt(await window.api.importSrt(track.id, path));
      refresh();
    }

    async function exportSrt() {
      const track = L.tracksOf(state.project, 'subtitle')[0];
      if (!track) return;
      const path = await window.api.pickSrtSave('subtitles.srt');
      if (!path) return;
      await window.api.exportSrt(track.id, path);
    }

    async function deleteSelected(ripple) {
      // Selections are exclusive, so a selected layer is the thing the user is
      // looking at; a gap cannot ripple behind one, so both buttons remove it.
      if (stageController.selectedVisualItem()) return inspectorController.removeSelectedVisualItem();
      const clipId = liveSelection();
      if (!clipId) return;
      // edit() answers null when the edit was refused. The empty array a delete
      // gets back is a success that made no clips, and it is not null.
      const done = await edit({ op: ripple ? 'rippleDelete' : 'removeClip', clipId });
      if (done) state.selectedClipId = null;
    }

    async function toggleClipLink() {
      const clipId = liveSelection();
      if (!clipId) return;
      const found = L.findClip(state.project, clipId);
      if (!found) return;
      if (found.clip.linkGroup) {
        await edit({ op: 'unlinkClips', clipId });
        return;
      }
      const candidate = L.relinkCandidate(state.project, clipId);
      if (!candidate) return;
      await edit({ op: 'linkClips', clipIds: [clipId, candidate.clip.id] });
    }

    async function setClipLut(clipId) {
      const path = await window.api.pickLut();
      if (!path) return;
      await window.api.validateLut(path);
      await edit({ op: 'setClipLut', clipId, lutPath: path });
    }

    async function addAdjustmentLayer(track, frame) {
      if (!track || track.kind !== 'video') return;
      const path = await window.api.pickLut();
      if (!path) return;
      await window.api.validateLut(path);
      await edit({
        op: 'addVisualItem',
        trackId: track.id,
        content: { kind: 'adjustment', lutPath: path },
        start: frame,
        duration: L.defaultVisualItemFrames(rate()),
        transform: {
          x: 0, y: 0, width: state.project.settings.width,
          height: state.project.settings.height, rotation: 0, opacity: 1,
        },
        zIndex: 0,
      });
    }

    async function addVisualKeyframesAt(item, frame) {
      const at = Math.max(item.start, Math.min(item.start + item.duration - 1, Math.round(frame)));
      const transform = L.visualTransformAt(item, at);
      await edit(...['x', 'y', 'width', 'height', 'rotation', 'opacity'].map((property) => ({
        op: 'setVisualKeyframe', itemId: item.id, property, frame: at,
        value: transform[property], easing: 'linear',
      })));
      state.selectedKeyframe = {
        type: 'visual', layerId: item.id, property: 'x', frame: at,
        value: transform.x, easing: 'linear',
      };
      inspectorController.render();
    }

    async function addVolumeKeyframeAt(clip, frame) {
      const at = Math.max(clip.start, Math.min(L.clipEnd(clip) - 1, Math.round(frame)));
      const value = L.clipVolumeAt(clip, at);
      await edit({
        op: 'setClipVolumeKeyframe', clipId: clip.id, frame: at, value, easing: 'linear',
      });
      state.selectedKeyframe = {
        type: 'volume', layerId: clip.id, property: 'volume', frame: at, value, easing: 'linear',
      };
      inspectorController.render();
    }

    return { setRuntime, renderHeads, clipElement, keyframeDot, visualElement, drawWaveform, renderLanes, renderRuler, renderMarkerList, updateHistoryUi, updateMonitorZoomUi, renderTimeline, checkLutFiles, refresh, updatePlayhead, seekPreviousEdit, seekNextEdit, seekTimelineStart, seekTimelineEnd, seekTimelineOffset, followPlayhead, closeTimelineContextMenu, openTimelineContextMenu, updateLinkUi, selectAsset, liveSelection, splitAtPlayhead, addMarker, visualTargetTrack, addVisualItem, addPip, addText, shapeTransform, addShape, addSubtitle, importSrt, exportSrt, deleteSelected, toggleClipLink, setClipLut, addAdjustmentLayer, addVisualKeyframesAt, addVolumeKeyframeAt };
  }

  return { createRendererTimelineUi };
});
