'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.programMonitorUiLib = exported;
})(globalThis, function () {
  function visualTransformFor(item, drag) {
    return drag && drag.itemId === item.id ? drag.next : item.transform;
  }

  function createProgramMonitorUi(deps) {
    const {
      G,
      I,
      L,
      T,
      X,
      api,
      deferTimelineOverlaySync,
      dom,
      edit,
      getPreview,
      persistSettingsInBackground,
      rate,
      refresh,
      renderInspector,
      reportError,
      state,
      staysOnCpu,
      updateLinkUi,
      updateMonitorZoomUi,
    } = deps;
    let visualDrag = null;
    let editorOverlayActive = false;

    function resizeProgramMonitor() {
      window.requestAnimationFrame(() => {
        getPreview().layout();
        renderStageOverlay();
        drawStageVisuals();
      });
    }

    function setFullscreen(active) {
      const before = document.body.classList.contains('program-monitor-fullscreen');
      if (before === active) return false;
      document.body.classList.toggle('program-monitor-fullscreen', active);
      resizeProgramMonitor();
      return true;
    }

    function toggleFullscreen() {
      return setFullscreen(!document.body.classList.contains('program-monitor-fullscreen'));
    }

    function exitFullscreen() {
      return setFullscreen(false);
    }

    // --- the exact frame -------------------------------------------------------

    let exactTimer = null;
    let exactToken = 0;

    function resetDocumentUi() {
      if (exactTimer !== null) window.clearTimeout(exactTimer);
      exactTimer = null;
      exactToken += 1;
      visualDrag = null;
      editorOverlayActive = false;
      dom.stage.classList.remove('editing');
      const preview = getPreview();
      if (preview) preview.setEditing(false);
    }

    function setStageMode(mode) {
      if (!dom.stageMode) return;
      // The badge exists to say which of two pictures is on screen. On the native
      // monitor there is only one — the same compositor draws the stopped frame and
      // the playing ones — so there is nothing to tell apart and nothing to show.
      const known = (mode === 'exact' || mode === 'live') &&
        (!getPreview().usesNativeMonitor() || editorOverlayActive);
      dom.stageMode.hidden = !known || L.projectDurationFrames(state.project) <= 0;
      dom.stageMode.textContent = mode === 'exact' ? 'exact frame' : 'live preview';
      dom.stageMode.classList.toggle('exact', mode === 'exact');
    }

    /** Ask Rust for the frame the render would produce here. It costs an ffmpeg
     *  call per visible clip, so it is only ever asked for when the playhead has
     *  stopped, and a newer request cancels an older one by token. */
    async function requestExactFrame() {
      if (!api.available) return;
      if (getPreview().usesNativeMonitor() && !editorOverlayActive) return;
      if (getPreview().isPlaying() || getPreview().mode() !== 'timeline') return;
      if (L.projectDurationFrames(state.project) <= 0) return;
      if (staysOnCpu()) return;
      const token = (exactToken += 1);
      const box = dom.stageInner.getBoundingClientRect();
      const maxWidth = Math.max(160, Math.round(box.width));
      try {
        const drawn = await api.previewFrame(Math.round(getPreview().position()), maxWidth);
        if (token !== exactToken || getPreview().isPlaying()) return;
        setStageMode(getPreview().showExact(drawn) ? 'exact' : 'live');
        // The exact frame already contains the text and shape layers, drawn by
        // the same Rust code the render uses; the page's copy comes off.
        drawStageVisuals();
      } catch (error) {
        // No graphics device, no ffmpeg, or a source that will not decode. The
        // stacked elements are still showing something, so this is not worth a
        // dialog; the badge keeps saying "live".
        setStageMode('live');
      }
    }

    function scheduleExactFrame() {
      if (!api.available) return;
      window.clearTimeout(exactTimer);
      if (getPreview().usesNativeMonitor() && !editorOverlayActive) return;
      if (getPreview().isPlaying() || getPreview().mode() !== 'timeline') return;
      exactTimer = window.setTimeout(requestExactFrame, 180);
    }

    // --- selection and editing -------------------------------------------------

    function selectClip(clipId) {
      state.selectedClipId = clipId;
      const targets = clipId ? I.clipTargets(state.project, clipId) : null;
      if (targets) state.inspectorTab = I.activeTab(targets);
      // One selection at a time, so the inspector always shows the thing that was
      // picked last rather than whichever kind happens to win a tie.
      if (clipId && state.selectedVisualItemId) selectVisualItem(null);
      for (const node of dom.lanes.querySelectorAll('.clip')) {
        node.classList.toggle('selected', node.dataset.clipId === clipId);
      }
      updateLinkUi();
      renderInspector();
    }

    function selectedVisualItem() {
      if (!state.selectedVisualItemId) return null;
      for (const track of state.project.tracks) {
        const item = (track.visualItems || []).find((entry) => entry.id === state.selectedVisualItemId);
        if (item) return item;
      }
      return null;
    }

    function visualTransform(item) {
      return visualTransformFor(item, visualDrag);
    }

    function projectPointAt(event) {
      const box = dom.stage.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return null;
      return X.projectPoint(
        { x: event.clientX - box.left, y: event.clientY - box.top },
        box,
        state.project.settings
      );
    }

    function overlayScale() {
      const box = dom.stage.getBoundingClientRect();
      return Math.min(
        box.width / Math.max(1, state.project.settings.width),
        box.height / Math.max(1, state.project.settings.height)
      );
    }

    function selectVisualItem(itemId) {
      state.selectedVisualItemId = itemId || null;
      if (itemId) state.inspectorTab = 'video';
      if (itemId && state.selectedClipId) selectClip(null);
      for (const node of dom.lanes.querySelectorAll('[data-visual-item-id]')) {
        node.classList.toggle('selected', node.dataset.visualItemId === state.selectedVisualItemId);
      }
      renderInspector();
      syncEditorOverlay();
      renderStageOverlay();
    }

    function editorOverlayWanted() {
      return Boolean(
        getPreview() &&
        getPreview().mode() === 'timeline' &&
        ((G.visible(state.settings) && !getPreview().usesNativeMonitor()) ||
          (state.selectedVisualItemId && !getPreview().isPlaying()))
      );
    }

    function syncEditorOverlay() {
      const active = editorOverlayWanted();
      dom.stage.classList.toggle('editing', Boolean(state.selectedVisualItemId));
      if (active === editorOverlayActive) return;
      if (deferTimelineOverlaySync()) return;
      editorOverlayActive = active;
      getPreview().setEditing(active);
      if (active) scheduleExactFrame();
      else {
        getPreview().clearExact();
        getPreview().redraw();
      }
    }

    function renderStageOverlay() {
      const canvas = dom.stageOverlay;
      const item = selectedVisualItem();
      const showGuides = G.visible(state.settings) &&
        (!getPreview() || !getPreview().usesNativeMonitor());
      if (!canvas || (!item && !showGuides)) {
        if (canvas) canvas.width = 0;
        return;
      }
      const box = dom.stage.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, box.width, box.height);
      if (showGuides) G.draw(context, state.settings, box.width, box.height);
      if (!item) return;
      const transform = visualTransform(item);
      const center = X.displayPoint(X.centre(transform), box, state.project.settings);
      const size = {
        x: (transform.width * box.width) / state.project.settings.width,
        y: (transform.height * box.height) / state.project.settings.height,
      };
      const scale = overlayScale();
      const handleRadius = 5;
      context.save();
      context.translate(center.x, center.y);
      context.rotate((transform.rotation * Math.PI) / 180);
      context.strokeStyle = '#4e9bff';
      context.lineWidth = 1.5;
      context.setLineDash([5, 3]);
      context.strokeRect(-size.x / 2, -size.y / 2, size.x, size.y);
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(0, -size.y / 2);
      context.lineTo(0, -size.y / 2 - 24);
      context.stroke();
      context.restore();
      const handles = X.handlePoints(transform, 24 / scale);
      for (const [name, point] of Object.entries(handles)) {
        const at = X.displayPoint(point, box, state.project.settings);
        context.beginPath();
        context.arc(at.x, at.y, name === 'rotate' ? 6 : handleRadius, 0, Math.PI * 2);
        context.fillStyle = name === 'rotate' ? '#4e9bff' : '#ffffff';
        context.fill();
        context.strokeStyle = '#4e9bff';
        context.lineWidth = 1.5;
        context.stroke();
      }
    }

    // --- text and shape layers on the stage -------------------------------------

    /** Draw the text and shape layers over the stacked media elements.
     *
     *  This is the page's approximation of the Rust compositor, and it exists for
     *  the one display the Rust picture cannot reach: the media element engine
     *  while it is playing. The paused stage shows the exact frame — the Rust
     *  picture, which already contains these layers — and the native monitor
     *  composites them in Rust, so both of those clear this canvas instead.
     *
     *  Like the preview itself, this is an approximation of the render: line
     *  breaks and glyph metrics come from the browser rather than from fontdue.
     *  Rotation is deliberately not drawn, because the Rust compositor does not
     *  draw it either, and the preview's job is to look like the render. */
    function drawStageVisuals() {
      const canvas = dom.stageVisuals;
      if (!canvas) return;
      const clear = () => {
        if (canvas.width > 0 || canvas.height > 0) {
          canvas.width = 0;
          canvas.height = 0;
        }
      };
      if (!getPreview() || getPreview().mode() !== 'timeline') return clear();
      if (getPreview().usesNativeMonitor() && !editorOverlayActive) return clear();
      if (getPreview().isExact()) return clear();
      const box = dom.stage.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return clear();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      const settings = state.project.settings;
      const scales = {
        x: box.width / Math.max(1, settings.width),
        y: box.height / Math.max(1, settings.height),
      };
      scales.font = Math.min(scales.x, scales.y);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, box.width, box.height);
      const frame = Math.floor(getPreview().position());
      // Tracks in project order: V1 first, which is the bottom layer, the same
      // order the Rust compositor takes them in.
      for (const track of state.project.tracks) {
        if (track.hidden) continue;
        if (track.kind !== 'video' && track.kind !== 'subtitle') continue;
        const items = (track.visualItems || [])
          .filter((item) => item.start <= frame && frame < item.start + item.duration)
          .sort((a, b) => a.zIndex - b.zIndex);
        for (const item of items) drawVisualItem(context, track, item, scales);
      }
    }

    function drawVisualItem(context, track, item, scales) {
      const settings = state.project.settings;
      // A subtitle ignores its own transform and sits in the lower third, exactly
      // as compositor/text.rs places it.
      const transform = track.kind === 'subtitle'
        ? { x: 96, y: settings.height * 0.78, width: settings.width - 192, height: settings.height * 0.16, opacity: 1 }
        : visualTransform(item);
      const x = transform.x * scales.x;
      const y = transform.y * scales.y;
      const width = Math.max(1, transform.width * scales.x);
      const height = Math.max(1, transform.height * scales.y);
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, transform.opacity ?? 1));
      context.translate(x, y);
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      const content = item.content || {};
      if (content.kind === 'shape') {
        drawShapeContent(context, content, width, height, scales.font);
      } else if (content.kind === 'text') {
        const style = (track.kind === 'subtitle' && track.subtitleStyle) || content.style || {};
        drawTextContent(context, content.text || '', style, width, height, scales.font);
      }
      context.restore();
    }

    function cssFontFamily(family) {
      const generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'];
      return generic.includes(family) ? family : `"${String(family).replace(/"/g, '')}"`;
    }

    function wrapVisualText(context, text, maxWidth) {
      const lines = [];
      for (const paragraph of String(text).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        lines.push(line);
      }
      return lines;
    }

    function drawTextContent(context, text, style, width, height, scale) {
      const size = Math.max(1, (style.fontSize || 64) * scale);
      context.font = `${size}px ${cssFontFamily(style.fontFamily || 'sans-serif')}`;
      const align = style.align || 'center';
      context.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
      context.textBaseline = 'alphabetic';
      const anchorX = align === 'left' ? 0 : align === 'right' ? width : width / 2;
      const stroke = style.stroke || null;
      const strokeWidth = Math.max(0, ((stroke && stroke.width) || 0) * scale);
      const shadow = style.shadow || null;
      const fills = style.fills && style.fills.length
        ? style.fills
        : [{ kind: 'solid', color: '#ffffff' }];
      const lines = wrapVisualText(context, text, width);
      for (let index = 0; index < lines.length; index += 1) {
        const baseline = index * size * 1.2 + size;
        if (baseline - size > height) break;
        if (shadow) {
          context.shadowColor = shadow.color || 'transparent';
          context.shadowOffsetX = (shadow.x || 0) * scale;
          context.shadowOffsetY = (shadow.y || 0) * scale;
          context.shadowBlur = Math.max(0, shadow.blur || 0) * scale;
        }
        if (strokeWidth > 0 && stroke.color) {
          // The Rust pass dilates by the radius, so the visible rim is the radius
          // wide; a canvas stroke straddles the edge, so it is doubled to match.
          context.lineWidth = strokeWidth * 2;
          context.lineJoin = 'round';
          context.strokeStyle = stroke.color;
          context.strokeText(lines[index], anchorX, baseline);
        }
        for (const fill of fills) {
          context.fillStyle = canvasPaint(context, fill, width, height);
          context.fillText(lines[index], anchorX, baseline);
          context.shadowColor = 'transparent';
        }
        context.shadowColor = 'transparent';
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 0;
      }
    }

    function orderedStops(stops) {
      const values = stops && stops.length ? stops : [
        { position: 0, color: '#ffffff' },
        { position: 1, color: '#000000' },
      ];
      return [...values].sort((a, b) => a.position - b.position);
    }

    const fillMediaElements = new Map();

    function mediaPaintPattern(context, paint, width, height) {
      const asset = L.findAsset(state.project, paint.assetId);
      if (!asset || asset.kind !== paint.kind) return '#00000000';
      const key = `${paint.kind}:${asset.id}`;
      let media = fillMediaElements.get(key);
      if (!media) {
        media = paint.kind === 'video' ? document.createElement('video') : new Image();
        media.src = api.fileUrl(asset.path);
        if (paint.kind === 'video') {
          media.muted = true;
          media.preload = 'auto';
          media.playsInline = true;
        }
        media.addEventListener('loadeddata', drawStageVisuals);
        media.addEventListener('load', drawStageVisuals);
        fillMediaElements.set(key, media);
      }
      const sourceWidth = media.videoWidth || media.naturalWidth || 0;
      const sourceHeight = media.videoHeight || media.naturalHeight || 0;
      if (paint.kind === 'video' && media.readyState >= 1 && Number.isFinite(media.duration) && media.duration > 0) {
        const time = (getPreview().position() / T.rateToNumber(rate())) % media.duration;
        if (Math.abs(media.currentTime - time) > 0.05) media.currentTime = time;
      }
      if (!sourceWidth || !sourceHeight) return '#00000000';
      const pattern = context.createPattern(media, 'no-repeat');
      if (!pattern) return '#00000000';
      if (pattern.setTransform && typeof DOMMatrix !== 'undefined') {
        pattern.setTransform(new DOMMatrix().scale(width / sourceWidth, height / sourceHeight));
      }
      return pattern;
    }

    function canvasPaint(context, paint, width, height) {
      if (!paint || paint.kind === 'solid') return (paint && paint.color) || '#00000000';
      if (paint.kind === 'linearGradient') {
        const start = paint.start || { x: 0, y: 0.5 };
        const end = paint.end || { x: 1, y: 0.5 };
        const gradient = context.createLinearGradient(
          start.x * width, start.y * height, end.x * width, end.y * height,
        );
        for (const stop of orderedStops(paint.stops)) {
          gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
        }
        return gradient;
      }
      if (paint.kind === 'radialGradient') {
        const center = paint.center || { x: 0.5, y: 0.5 };
        const radius = Math.max(0.001, paint.radius || 0.5) * Math.max(width, height);
        const gradient = context.createRadialGradient(
          center.x * width, center.y * height, 0,
          center.x * width, center.y * height, radius,
        );
        for (const stop of orderedStops(paint.stops)) {
          gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
        }
        return gradient;
      }
      if (paint.kind === 'image' || paint.kind === 'video') {
        return mediaPaintPattern(context, paint, width, height);
      }
      return '#00000000';
    }

    function beginShapePath(context, kind, width, height, radius) {
      context.beginPath();
      if (kind === 'ellipse') {
        context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        return;
      }
      if (kind === 'polygon' || kind === 'star') {
        const points = kind === 'star' ? 10 : 6;
        const outer = Math.min(width, height) / 2;
        const inner = kind === 'star' ? outer * 0.45 : outer;
        for (let index = 0; index < points; index += 1) {
          const angle = -Math.PI / 2 + index * Math.PI * 2 / points;
          const distance = kind === 'star' && index % 2 ? inner : outer;
          const x = width / 2 + Math.cos(angle) * distance;
          const y = height / 2 + Math.sin(angle) * distance;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        return;
      }
      if (kind === 'roundedRectangle') context.roundRect(0, 0, width, height, radius);
      else context.rect(0, 0, width, height);
    }

    function drawShapeContent(context, content, width, height, scale) {
      const stroke = content.stroke || null;
      const strokeWidth = Math.max(0, ((stroke && stroke.width) || 0) * scale);
      const kind = content.shape || 'rectangle';
      if (kind === 'line' && strokeWidth <= 0) return;
      const shadow = content.shadow || null;
      if (shadow) {
        context.shadowColor = shadow.color || 'transparent';
        context.shadowOffsetX = (shadow.x || 0) * scale;
        context.shadowOffsetY = (shadow.y || 0) * scale;
        context.shadowBlur = Math.max(0, shadow.blur || 0) * scale;
      }
      if (kind === 'line') {
        // A line is all stroke: a bar through the middle, plus the arrow heads.
        // Nothing is drawn at width zero, the same rule the Rust rasterizer has.
        const middle = height / 2;
        const half = strokeWidth / 2;
        const arrow = Math.max(strokeWidth * 1.5, 8);
        context.fillStyle = stroke.color;
        context.fillRect(half, middle - half, Math.max(0, width - strokeWidth), strokeWidth);
        const head = (tipX, direction) => {
          context.beginPath();
          context.moveTo(tipX, middle);
          context.lineTo(tipX + direction * arrow, middle - arrow * 0.65);
          context.lineTo(tipX + direction * arrow, middle + arrow * 0.65);
          context.closePath();
          context.fill();
        };
        if (content.startArrow) head(0, 1);
        if (content.endArrow) head(width, -1);
        context.shadowColor = 'transparent';
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 0;
        return;
      }
      const radius = Math.min(
        Math.max(0, (content.cornerRadius ?? 0) * scale),
        Math.min(width, height) / 2,
      );
      const fills = content.fills && content.fills.length
        ? content.fills
        : [{ kind: 'solid', color: '#4f8cffcc' }];
      for (const fill of fills) {
        beginShapePath(context, kind, width, height, radius);
        context.fillStyle = canvasPaint(context, fill, width, height);
        context.fill();
        context.shadowColor = 'transparent';
      }
      if (strokeWidth > 0) {
        // The Rust outline is a band half the width lying inside the edge, so the
        // stroke is clipped to the shape — which throws away its outer half and
        // leaves the same half-width rim.
        context.save();
        beginShapePath(context, kind, width, height, radius);
        context.clip();
        context.lineWidth = strokeWidth;
        context.strokeStyle = stroke.color;
        context.stroke();
        context.restore();
      }
      context.shadowColor = 'transparent';
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.shadowBlur = 0;
    }

    function beginVisualDrag(event) {
      if (event.button !== 0 || getPreview().isPlaying()) return false;
      const point = projectPointAt(event);
      if (!point) return false;
      const scale = overlayScale();
      const hit = X.hitItem(
        state.project,
        Math.round(getPreview().position()),
        point,
        state.selectedVisualItemId,
        { handleRadius: 8 / scale, rotateOffset: 24 / scale }
      );
      if (!hit) {
        selectVisualItem(null);
        return false;
      }
      if (hit.item.id !== state.selectedVisualItemId) selectVisualItem(hit.item.id);
      visualDrag = {
        itemId: hit.item.id,
        action: hit.action === 'resize' ? hit.handle : hit.action,
        initial: { ...hit.item.transform },
        start: point,
        next: { ...hit.item.transform },
      };
      getPreview().clearExact();
      drawStageVisuals();
      dom.stage.setPointerCapture(event.pointerId);
      event.preventDefault();
      return true;
    }

    function updateVisualDrag(event) {
      if (!visualDrag) return;
      const point = projectPointAt(event);
      if (!point) return;
      visualDrag.next = X.transformForDrag(
        visualDrag.initial,
        visualDrag.action,
        visualDrag.start,
        point
      );
      renderStageOverlay();
      // The page's own copy of the layer moves with the handles. Without this the
      // dashed box slides away from the shape it is supposed to be around, until
      // the drag ends and the redraw catches up.
      drawStageVisuals();
    }

    async function endVisualDrag(event) {
      if (!visualDrag) return;
      const finished = visualDrag;
      visualDrag = null;
      if (dom.stage.hasPointerCapture(event.pointerId)) dom.stage.releasePointerCapture(event.pointerId);
      if (JSON.stringify(finished.initial) === JSON.stringify(finished.next)) {
        drawStageVisuals();
        scheduleExactFrame();
        return;
      }
      try {
        await edit({ op: 'setVisualTransform', itemId: finished.itemId, transform: finished.next });
        selectVisualItem(finished.itemId);
      } finally {
        drawStageVisuals();
        scheduleExactFrame();
      }
    }

    function cancelVisualDrag() {
      if (!visualDrag) return;
      visualDrag = null;
      renderStageOverlay();
      drawStageVisuals();
      scheduleExactFrame();
    }


    function wireTransport() {
      let monitorPan = null;
      dom.btnPlay.addEventListener('click', () => getPreview().toggle());
      dom.previewQuality.addEventListener('change', () => {
        state.settings.previewQuality = dom.previewQuality.value;
        getPreview().setQuality(state.settings.previewQuality);
        persistSettingsInBackground();
      });
      dom.stage.addEventListener('wheel', (event) => {
        if (!event.metaKey) return;
        const box = dom.stage.getBoundingClientRect();
        const cursor = { x: event.clientX - box.left, y: event.clientY - box.top };
        const changed = event.deltaY < 0 ? getPreview().zoomIn(cursor) : getPreview().zoomOut(cursor);
        if (changed) {
          event.preventDefault();
          updateMonitorZoomUi();
        }
      }, { passive: false });
      dom.stage.addEventListener('pointerdown', (event) => {
        if (beginVisualDrag(event)) return;
        const zoom = getPreview().zoomState();
        if (event.button !== 0 || !zoom.available || zoom.zoom <= 1) return;
        monitorPan = { x: event.clientX, y: event.clientY };
        dom.stage.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      dom.stage.addEventListener('pointermove', (event) => {
        if (visualDrag) {
          updateVisualDrag(event);
          return;
        }
        if (!monitorPan) return;
        getPreview().panBy(event.clientX - monitorPan.x, event.clientY - monitorPan.y);
        monitorPan = { x: event.clientX, y: event.clientY };
      });
      dom.stage.addEventListener('pointerup', (event) => {
        if (visualDrag) {
          endVisualDrag(event).catch((error) => reportError(error, 'visual-item:transform'));
          return;
        }
        if (!monitorPan) return;
        monitorPan = null;
        dom.stage.releasePointerCapture(event.pointerId);
      });
      dom.stage.addEventListener('pointercancel', () => {
        cancelVisualDrag();
        monitorPan = null;
      });
    }


    return {
      drawStageVisuals,
      editorOverlayWanted,
      exitFullscreen,
      orderedStops,
      renderStageOverlay,
      resetDocumentUi,
      scheduleExactFrame,
      selectClip,
      selectedVisualItem,
      selectVisualItem,
      setStageMode,
      syncEditorOverlay,
      toggleFullscreen,
      wireTransport,
    };
  }

  return { createProgramMonitorUi, visualTransformFor };
});
