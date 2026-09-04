'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.inspectorUiLib = exported;
})(globalThis, function () {
  function createInspectorUi(deps) {
    const {
      I,
      L,
      P,
      activateSelectedPanel,
      api,
      baseName,
      dom,
      edit,
      getPreview,
      liveSelection,
      orderedStops,
      reportError,
      selectVisualItem,
      selectedVisualItem,
      state,
    } = deps;

    function hexColor(value, fallback) {
      const match = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(value || '');
      return match ? `#${match[1]}` : fallback;
    }

    function preserveAlpha(color, previous) {
      const alpha = /^#[0-9a-fA-F]{8}$/.test(previous || '') ? previous.slice(7) : '';
      return `${color}${alpha}`;
    }

    function topPaint(style, fallback) {
      return style && style.fills && style.fills.length
        ? style.fills[style.fills.length - 1]
        : { kind: 'solid', color: fallback };
    }

    function paintColors(paint, fallback) {
      if (!paint || paint.kind === 'solid') return [(paint && paint.color) || fallback, fallback];
      const stops = orderedStops(paint.stops);
      return [stops[0].color, stops[stops.length - 1].color];
    }

    function fillAssetOptions(select, kind, selected) {
      select.textContent = '';
      const wanted = kind === 'video' ? 'video' : 'image';
      for (const asset of state.project.assets.filter((entry) => entry.kind === wanted)) {
        const option = document.createElement('option');
        option.value = asset.id;
        option.textContent = asset.name || baseName(asset.path);
        option.selected = asset.id === selected;
        select.appendChild(option);
      }
      select.disabled = kind !== 'image' && kind !== 'video';
    }

    function showFillEditor(kindInput, colorInput, endInput, assetInput, style, fallback) {
      const paint = topPaint(style, fallback);
      const [start, end] = paintColors(paint, fallback);
      kindInput.value = paint.kind;
      colorInput.value = hexColor(start, fallback.slice(0, 7));
      endInput.value = hexColor(end, '#000000');
      const assetId = paint.assetId || '';
      fillAssetOptions(assetInput, paint.kind, assetId);
      endInput.disabled = paint.kind !== 'linearGradient' && paint.kind !== 'radialGradient';
      colorInput.disabled = paint.kind === 'image' || paint.kind === 'video';
    }

    function paintFromEditor(kind, color, endColor, assetId, previous) {
      if (kind === 'image' || kind === 'video') {
        const asset = state.project.assets.find((entry) => entry.id === assetId && entry.kind === kind)
          || state.project.assets.find((entry) => entry.kind === kind);
        return { kind, assetId: asset ? asset.id : '' };
      }
      if (kind === 'linearGradient') {
        return {
          kind,
          start: (previous && previous.kind === kind && previous.start) || { x: 0, y: 0.5 },
          end: (previous && previous.kind === kind && previous.end) || { x: 1, y: 0.5 },
          stops: [
            { position: 0, color: preserveAlpha(color, paintColors(previous, color)[0]) },
            { position: 1, color: preserveAlpha(endColor, paintColors(previous, endColor)[1]) },
          ],
        };
      }
      if (kind === 'radialGradient') {
        return {
          kind,
          center: (previous && previous.kind === kind && previous.center) || { x: 0.5, y: 0.5 },
          radius: (previous && previous.kind === kind && previous.radius) || 0.5,
          stops: [
            { position: 0, color: preserveAlpha(color, paintColors(previous, color)[0]) },
            { position: 1, color: preserveAlpha(endColor, paintColors(previous, endColor)[1]) },
          ],
        };
      }
      return { kind: 'solid', color: preserveAlpha(color, paintColors(previous, color)[0]) };
    }

    function inspectorMessage(tab, item, clipTargets) {
      if (tab === 'effects') return 'No effect is selected.';
      if (tab === 'transition') return 'No transition is selected.';
      if (tab === 'image') {
        const asset = L.findAsset(state.project, state.selectedAssetId);
        return asset && asset.kind === 'image'
          ? `Image — ${asset.name || baseName(asset.path)}`
          : 'Select an image asset to inspect it.';
      }
      if (tab === 'file') {
        const selected = clipTargets && clipTargets.selected;
        const asset = selected
          ? L.findAsset(state.project, selected.clip.assetId)
          : L.findAsset(state.project, state.selectedAssetId);
        return asset ? `File — ${asset.name || baseName(asset.path)}` : 'Select an asset or clip to inspect its file.';
      }
      if (tab === 'audio') return 'Select a clip with audio properties.';
      return item ? 'No video properties are available.' : 'Select a clip or a layer to edit its properties.';
    }

    /** The inspector beside the preview. One switch over what is selected: a text,
     *  shape or subtitle layer, else the selected clip, else the empty hint. */
    function renderInspector() {
      const item = selectedVisualItem();
      const text = item && item.content && item.content.kind === 'text' ? item.content : null;
      const shape = item && item.content && item.content.kind === 'shape' ? item.content : null;
      const track = item && state.project.tracks.find((candidate) => (candidate.visualItems || []).some((entry) => entry.id === item.id));
      const subtitle = track && track.kind === 'subtitle';
      const clipTargets = !item && liveSelection()
        ? I.clipTargets(state.project, liveSelection())
        : null;
      const clip = clipTargets && clipTargets.selected;
      const tab = state.inspectorTab || 'video';
      const video = tab === 'video';
      const audio = tab === 'audio';
      const selectedKeyframe = state.selectedKeyframe;
      const hasProperties = (video && Boolean(item || (clipTargets && clipTargets.video))) ||
        (audio && Boolean(clipTargets && clipTargets.audio));
      dom.textPanel.hidden = !video || !text || subtitle;
      dom.subtitlePanel.hidden = !video || !text || !subtitle;
      dom.shapePanel.hidden = !video || !shape;
      dom.clipPanel.hidden = !clip || (!video && !audio);
      dom.transformPanel.hidden = !video || !item;
      dom.keyframePanel.hidden = !selectedKeyframe;
      dom.inspectorEmpty.hidden = hasProperties;
      dom.inspectorEmpty.textContent = inspectorMessage(tab, item, clipTargets);
      for (const button of dom.panelTabBar.querySelectorAll('[data-inspector-tab]')) {
        const active = button.dataset.inspectorTab === tab;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
      }
      if (item) {
        const preview = getPreview();
        const transform = L.visualTransformAt(item, preview ? preview.position() : item.start);
        dom.transformX.value = transform.x;
        dom.transformY.value = transform.y;
        dom.transformWidth.value = transform.width;
        dom.transformHeight.value = transform.height;
        dom.transformRotation.value = transform.rotation;
        dom.transformOpacity.value = transform.opacity;
        dom.transformOpacityValue.value = transform.opacity;
        dom.visualBlendMode.value = item.blendMode || 'normal';
      }
      if (clip) {
        const asset = L.findAsset(state.project, clip.clip.assetId);
        dom.clipSummary.textContent = `${asset ? asset.name || baseName(asset.path) : 'missing file'} · ${clip.track.name}`;
        dom.clipVideoPanel.hidden = !video || !clipTargets.video;
        dom.clipAudioPanel.hidden = !audio || !clipTargets.audio;
        if (clipTargets.video) dom.clipOpacity.value = String(clipTargets.video.clip.opacity ?? 1);
        if (clipTargets.video) dom.clipBlendMode.value = clipTargets.video.clip.blendMode || 'normal';
        if (clipTargets.audio) {
          const audioClip = clipTargets.audio.clip;
          dom.clipVolume.value = String(audioClip.volume ?? 1);
          dom.clipSpeed.value = String(audioClip.speed ?? 1);
          dom.clipPreservePitch.checked = audioClip.preservePitch !== false;
          dom.clipFadeIn.value = String(audioClip.fadeIn || 0);
          dom.clipFadeOut.value = String(audioClip.fadeOut || 0);
        }
      }
      if (selectedKeyframe) {
        dom.keyframeSummary.textContent = `${selectedKeyframe.property} · ${selectedKeyframe.type === 'volume' ? 'audio' : 'visual'}`;
        dom.keyframeFrame.value = selectedKeyframe.frame;
        dom.keyframeValue.value = selectedKeyframe.value;
        dom.keyframeEasing.value = selectedKeyframe.easing || 'linear';
      }
      if (shape) {
        dom.shapeKind.value = shape.shape || 'rectangle';
        showFillEditor(
          dom.shapeFillKind, dom.shapeFill, dom.shapeFillEndColor, dom.shapeFillAsset,
          shape, '#4f8cffcc',
        );
        dom.shapeRemoveFill.disabled = !shape.fills || shape.fills.length <= 1;
        dom.shapeStroke.value = hexColor(shape.stroke && shape.stroke.color, '#ffffff');
        dom.shapeStrokeWidth.value = shape.stroke ? shape.stroke.width : 0;
        dom.shapeCornerRadius.value = shape.cornerRadius ?? 0;
        dom.shapeStartArrow.checked = Boolean(shape.startArrow);
        dom.shapeEndArrow.checked = Boolean(shape.endArrow);
        dom.shapeShadowEnabled.checked = Boolean(shape.shadow);
        dom.shapeShadowColor.value = hexColor(shape.shadow && shape.shadow.color, '#000000');
        dom.shapeShadowX.value = shape.shadow ? shape.shadow.x : 0;
        dom.shapeShadowY.value = shape.shadow ? shape.shadow.y : 0;
        dom.shapeShadowBlur.value = shape.shadow ? shape.shadow.blur : 0;
      }
      if (!text) return;
      if (subtitle) {
        dom.subtitleValue.value = text.text || '';
        dom.subtitleStart.value = item.start;
        dom.subtitleEnd.value = item.start + item.duration;
        const subtitleStyle = track.subtitleStyle || {};
        dom.subtitleFont.value = subtitleStyle.fontFamily || 'sans-serif';
        dom.subtitleSize.value = subtitleStyle.fontSize || 64;
        dom.subtitleColor.value = hexColor(paintColors(topPaint(subtitleStyle, '#ffffff'), '#ffffff')[0], '#ffffff');
        return;
      }
      const style = text.style || {};
      dom.textValue.value = text.text || '';
      dom.textFont.value = style.fontFamily || 'sans-serif';
      dom.textSize.value = style.fontSize || 64;
      showFillEditor(
        dom.textFillKind, dom.textColor, dom.textFillEndColor, dom.textFillAsset,
        style, '#ffffff',
      );
      dom.textRemoveFill.disabled = !style.fills || style.fills.length <= 1;
      dom.textAlign.value = style.align || 'center';
      dom.textStrokeColor.value = hexColor(style.stroke && style.stroke.color, '#000000');
      dom.textStrokeWidth.value = style.stroke ? style.stroke.width : 0;
      dom.textShadowEnabled.checked = Boolean(style.shadow);
      dom.textShadowColor.value = hexColor(style.shadow && style.shadow.color, '#000000');
      dom.textShadowX.value = style.shadow ? style.shadow.x : 0;
      dom.textShadowY.value = style.shadow ? style.shadow.y : 0;
      dom.textShadowBlur.value = style.shadow ? style.shadow.blur : 0;
    }

    function updateSelectedTransform(event) {
      const item = selectedVisualItem();
      if (!item) return;
      if (event && event.target === dom.transformOpacity) {
        dom.transformOpacityValue.value = dom.transformOpacity.value;
      } else if (event && event.target === dom.transformOpacityValue) {
        dom.transformOpacity.value = dom.transformOpacityValue.value;
      }
      const transform = {
        x: Number(dom.transformX.value),
        y: Number(dom.transformY.value),
        width: Math.max(1, Number(dom.transformWidth.value) || 1),
        height: Math.max(1, Number(dom.transformHeight.value) || 1),
        rotation: Number(dom.transformRotation.value),
        opacity: Math.max(0, Math.min(1, Number(dom.transformOpacityValue.value) || 0)),
      };
      edit({ op: 'setVisualTransform', itemId: item.id, transform })
        .then(() => selectVisualItem(item.id))
        .catch((error) => reportError(error, 'transform:edit'));
    }

    function updateSelectedShape() {
      const item = selectedVisualItem();
      if (!item || item.content.kind !== 'shape') return;
      const fills = [...(item.content.fills || [])];
      const first = topPaint(item.content, '#4f8cffcc');
      const paint = paintFromEditor(
        dom.shapeFillKind.value,
        dom.shapeFill.value,
        dom.shapeFillEndColor.value,
        dom.shapeFillAsset.value,
        first,
      );
      if ((paint.kind === 'image' || paint.kind === 'video') && !paint.assetId) {
        api.message(`Import a matching ${paint.kind} asset before using that fill.`, {
          title: 'Fill media unavailable', kind: 'warning',
        });
        renderInspector();
        return;
      }
      fills[Math.max(0, fills.length - 1)] = paint;
      const strokeWidth = Math.max(0, Number(dom.shapeStrokeWidth.value) || 0);
      const previousShadow = item.content.shadow || {};
      const content = {
        kind: 'shape',
        shape: dom.shapeKind.value,
        fills,
        stroke: strokeWidth > 0 ? {
          color: preserveAlpha(dom.shapeStroke.value, item.content.stroke && item.content.stroke.color),
          width: strokeWidth,
        } : null,
        shadow: dom.shapeShadowEnabled.checked ? {
          color: preserveAlpha(dom.shapeShadowColor.value, previousShadow.color),
          x: Number(dom.shapeShadowX.value) || 0,
          y: Number(dom.shapeShadowY.value) || 0,
          blur: Math.max(0, Number(dom.shapeShadowBlur.value) || 0),
        } : null,
        cornerRadius: Math.max(0, Number(dom.shapeCornerRadius.value) || 0),
        startArrow: dom.shapeStartArrow.checked,
        endArrow: dom.shapeEndArrow.checked,
      };
      edit({ op: 'setVisualContent', itemId: item.id, content })
        .then(() => selectVisualItem(item.id))
        .catch((error) => reportError(error, 'shape:edit'));
    }

    function changeSelectedFillLayers(kind, add) {
      const item = selectedVisualItem();
      if (!item || item.content.kind !== kind) return;
      const owner = kind === 'text' ? (item.content.style || {}) : item.content;
      const fills = [...(owner.fills || [])];
      if (add) fills.push({ kind: 'solid', color: kind === 'text' ? '#ffffff80' : '#4f8cff80' });
      else if (fills.length > 1) fills.pop();
      const content = kind === 'text'
        ? { ...item.content, style: { ...owner, fills } }
        : { ...item.content, fills };
      edit({ op: 'setVisualContent', itemId: item.id, content })
        .then(() => selectVisualItem(item.id))
        .catch((error) => reportError(error, `${kind}:fills`));
    }

    function updateSelectedSubtitle() {
      const item = selectedVisualItem();
      if (!item || item.content.kind !== 'text') return;
      const start = Math.max(0, Math.round(Number(dom.subtitleStart.value) || 0));
      const end = Math.max(start + 1, Math.round(Number(dom.subtitleEnd.value) || start + 1));
      edit(
        { op: 'setVisualContent', itemId: item.id, content: { ...item.content, text: dom.subtitleValue.value } },
        { op: 'setVisualTiming', itemId: item.id, start, duration: end - start },
      ).catch((error) => reportError(error, 'subtitle:edit'));
    }

    function updateSubtitleStyle() {
      const item = selectedVisualItem();
      const track = item && state.project.tracks.find((candidate) => (candidate.visualItems || []).some((entry) => entry.id === item.id));
      if (!track || track.kind !== 'subtitle') return;
      const style = {
        ...(track.subtitleStyle || {}),
        fontFamily: dom.subtitleFont.value || 'sans-serif',
        fontSize: Math.max(8, Number(dom.subtitleSize.value) || 64),
        fills: [{
          kind: 'solid',
          color: preserveAlpha(
            dom.subtitleColor.value,
            paintColors(topPaint(track.subtitleStyle, '#ffffff'), '#ffffff')[0],
          ),
        }],
      };
      edit({ op: 'setSubtitleStyle', trackId: track.id, style }).catch((error) => reportError(error, 'subtitle:style'));
    }

    function updateSelectedText() {
      const item = selectedVisualItem();
      if (!item || item.content.kind !== 'text') return;
      const previousStyle = item.content.style || {};
      const fills = [...(previousStyle.fills || [])];
      const first = topPaint(previousStyle, '#ffffff');
      const paint = paintFromEditor(
        dom.textFillKind.value,
        dom.textColor.value,
        dom.textFillEndColor.value,
        dom.textFillAsset.value,
        first,
      );
      if ((paint.kind === 'image' || paint.kind === 'video') && !paint.assetId) {
        api.message(`Import a matching ${paint.kind} asset before using that fill.`, {
          title: 'Fill media unavailable', kind: 'warning',
        });
        renderInspector();
        return;
      }
      fills[Math.max(0, fills.length - 1)] = paint;
      const strokeWidth = Math.max(0, Number(dom.textStrokeWidth.value) || 0);
      const previousShadow = previousStyle.shadow || {};
      const style = {
        ...(item.content.style || {}),
        fontFamily: dom.textFont.value || 'sans-serif',
        fontSize: Math.max(8, Number(dom.textSize.value) || 64),
        fills,
        align: dom.textAlign.value,
        stroke: strokeWidth > 0 ? {
          color: preserveAlpha(dom.textStrokeColor.value, previousStyle.stroke && previousStyle.stroke.color),
          width: strokeWidth,
        } : null,
        shadow: dom.textShadowEnabled.checked ? {
          color: preserveAlpha(dom.textShadowColor.value, previousShadow.color),
          x: Number(dom.textShadowX.value) || 0,
          y: Number(dom.textShadowY.value) || 0,
          blur: Math.max(0, Number(dom.textShadowBlur.value) || 0),
        } : null,
      };
      Promise.resolve(api.fontAvailable(style.fontFamily))
        .then((available) => {
          if (!available) {
            return api.message(
              `"${style.fontFamily}" is not installed. A sans-serif fallback will be used.`,
              { title: 'Font unavailable', kind: 'warning' },
            );
          }
        })
        .then(() => edit({
          op: 'setVisualContent',
          itemId: item.id,
          content: { kind: 'text', text: dom.textValue.value, style },
        }))
        .then(() => selectVisualItem(item.id))
        .catch((error) => reportError(error, 'text:edit'));
    }

    async function removeSelectedVisualItem() {
      const item = selectedVisualItem();
      if (!item) return;
      const done = await edit({ op: 'removeVisualItem', itemId: item.id });
      if (done) selectVisualItem(null);
    }

    /** Resolve both halves of a linked timeline selection for the Inspector tabs. */
    function selectedClipTargets() {
      const clipId = liveSelection();
      return clipId ? I.clipTargets(state.project, clipId) : null;
    }

    function updateSelectedVideoOpacity() {
      const targets = selectedClipTargets();
      if (!targets || !targets.video) return;
      edit({
        op: 'setClipGain',
        clipId: targets.video.clip.id,
        opacity: Math.max(0, Math.min(1, Number(dom.clipOpacity.value) || 0)),
      }).catch((error) => reportError(error, 'clip:opacity'));
    }

    function updateSelectedAudioVolume() {
      const targets = selectedClipTargets();
      if (!targets || !targets.audio) return;
      edit({
        op: 'setClipGain',
        clipId: targets.audio.clip.id,
        volume: Math.max(0, Math.min(1, Number(dom.clipVolume.value) || 0)),
      }).catch((error) => reportError(error, 'clip:volume'));
    }

    function currentFrame() {
      const preview = getPreview();
      return Math.max(0, Math.round(preview ? preview.position() : 0));
    }

    function addTransformKeyframes() {
      const item = selectedVisualItem();
      if (!item) return;
      const frame = Math.max(item.start, Math.min(item.start + item.duration - 1, currentFrame()));
      const transform = L.visualTransformAt(item, frame);
      const commands = ['x', 'y', 'width', 'height', 'rotation', 'opacity'].map((property) => ({
        op: 'setVisualKeyframe',
        itemId: item.id,
        property,
        frame,
        value: transform[property],
        easing: 'linear',
      }));
      edit(...commands).then(() => {
        state.selectedKeyframe = {
          type: 'visual', layerId: item.id, property: 'x', frame,
          value: transform.x, easing: 'linear',
        };
        renderInspector();
      }).catch((error) => reportError(error, 'keyframe:add'));
    }

    function addVolumeKeyframe() {
      const targets = selectedClipTargets();
      if (!targets || !targets.audio) return;
      const clip = targets.audio.clip;
      const frame = Math.max(clip.start, Math.min(L.clipEnd(clip) - 1, currentFrame()));
      const value = L.clipVolumeAt(clip, frame);
      edit({
        op: 'setClipVolumeKeyframe', clipId: clip.id, frame, value, easing: 'linear',
      }).then(() => {
        state.selectedKeyframe = {
          type: 'volume', layerId: clip.id, property: 'volume', frame, value, easing: 'linear',
        };
        renderInspector();
      }).catch((error) => reportError(error, 'volume-keyframe:add'));
    }

    function updatePlayback() {
      const targets = selectedClipTargets();
      if (!targets || !targets.audio) return;
      edit({
        op: 'setClipPlayback',
        clipId: targets.audio.clip.id,
        speed: Math.max(0.1, Math.min(16, Number(dom.clipSpeed.value) || 1)),
        preservePitch: dom.clipPreservePitch.checked,
        fadeIn: Math.max(0, Math.round(Number(dom.clipFadeIn.value) || 0)),
        fadeOut: Math.max(0, Math.round(Number(dom.clipFadeOut.value) || 0)),
      }).catch((error) => reportError(error, 'clip:playback'));
    }

    function updateLayerBlend(layerId, value) {
      if (!layerId) return;
      edit({ op: 'setLayerBlendMode', layerId, blendMode: value })
        .catch((error) => reportError(error, 'layer:blend'));
    }

    function updateKeyframe() {
      const selected = state.selectedKeyframe;
      if (!selected) return;
      const frame = Math.max(0, Math.round(Number(dom.keyframeFrame.value) || 0));
      const value = Number(dom.keyframeValue.value);
      if (dom.keyframeValue.value.trim() === '' || !Number.isFinite(value)) return;
      const command = selected.type === 'volume'
        ? { op: 'setClipVolumeKeyframe', clipId: selected.layerId, frame, value, easing: dom.keyframeEasing.value }
        : { op: 'setVisualKeyframe', itemId: selected.layerId, property: selected.property, frame, value, easing: dom.keyframeEasing.value };
      const remove = selected.type === 'volume'
        ? { op: 'removeClipVolumeKeyframe', clipId: selected.layerId, frame: selected.frame }
        : { op: 'removeVisualKeyframe', itemId: selected.layerId, property: selected.property, frame: selected.frame };
      edit(remove, command).then(() => {
        state.selectedKeyframe = { ...selected, frame, value, easing: dom.keyframeEasing.value };
        renderInspector();
      }).catch((error) => reportError(error, 'keyframe:update'));
    }

    function deleteKeyframe() {
      const selected = state.selectedKeyframe;
      if (!selected) return;
      const command = selected.type === 'volume'
        ? { op: 'removeClipVolumeKeyframe', clipId: selected.layerId, frame: selected.frame }
        : { op: 'removeVisualKeyframe', itemId: selected.layerId, property: selected.property, frame: selected.frame };
      edit(command).then(() => {
        state.selectedKeyframe = null;
        renderInspector();
      }).catch((error) => reportError(error, 'keyframe:delete'));
    }

    function activateInspectorTab(tab) {
      state.inspectorTab = tab;
      activateSelectedPanel('inspector');
      renderInspector();
    }

    function moveInspectorTab(event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextName = P.adjacentTab(event.currentTarget.dataset.inspectorTab, offset);
      const next = dom.panelTabBar.querySelector(`[data-inspector-tab="${nextName}"]`);
      activateInspectorTab(nextName);
      next.focus();
      event.preventDefault();
    }

    function wire() {
      for (const button of dom.panelTabBar.querySelectorAll('[data-inspector-tab]')) {
        button.addEventListener('click', () => activateInspectorTab(button.dataset.inspectorTab));
        button.addEventListener('keydown', moveInspectorTab);
      }
      for (const input of [
        dom.textValue, dom.textFont, dom.textSize, dom.textFillKind, dom.textColor,
        dom.textFillEndColor, dom.textFillAsset, dom.textAlign, dom.textStrokeColor,
        dom.textStrokeWidth, dom.textShadowEnabled, dom.textShadowColor,
        dom.textShadowX, dom.textShadowY, dom.textShadowBlur,
      ]) {
        input.addEventListener('change', updateSelectedText);
      }
      for (const input of [
        dom.shapeKind, dom.shapeFillKind, dom.shapeFill, dom.shapeFillEndColor,
        dom.shapeFillAsset, dom.shapeStroke, dom.shapeStrokeWidth,
        dom.shapeCornerRadius, dom.shapeShadowEnabled, dom.shapeShadowColor,
        dom.shapeShadowX, dom.shapeShadowY, dom.shapeShadowBlur,
        dom.shapeStartArrow, dom.shapeEndArrow,
      ]) {
        input.addEventListener('change', updateSelectedShape);
      }
      for (const input of [dom.subtitleValue, dom.subtitleStart, dom.subtitleEnd]) {
        input.addEventListener('change', updateSelectedSubtitle);
      }
      for (const input of [dom.subtitleFont, dom.subtitleSize, dom.subtitleColor]) {
        input.addEventListener('change', updateSubtitleStyle);
      }
      dom.clipOpacity.addEventListener('change', updateSelectedVideoOpacity);
      dom.clipVolume.addEventListener('change', updateSelectedAudioVolume);
      dom.visualBlendMode.addEventListener('change', () => {
        const item = selectedVisualItem();
        updateLayerBlend(item && item.id, dom.visualBlendMode.value);
      });
      dom.clipBlendMode.addEventListener('change', () => {
        const targets = selectedClipTargets();
        updateLayerBlend(targets && targets.video && targets.video.clip.id, dom.clipBlendMode.value);
      });
      for (const input of [dom.clipSpeed, dom.clipPreservePitch, dom.clipFadeIn, dom.clipFadeOut]) {
        input.addEventListener('change', updatePlayback);
      }
      dom.addTransformKeyframes.addEventListener('click', addTransformKeyframes);
      dom.addVolumeKeyframe.addEventListener('click', addVolumeKeyframe);
      dom.keyframeUpdate.addEventListener('click', updateKeyframe);
      dom.keyframeDelete.addEventListener('click', deleteKeyframe);
      dom.textAddFill.addEventListener('click', () => changeSelectedFillLayers('text', true));
      dom.textRemoveFill.addEventListener('click', () => changeSelectedFillLayers('text', false));
      dom.shapeAddFill.addEventListener('click', () => changeSelectedFillLayers('shape', true));
      dom.shapeRemoveFill.addEventListener('click', () => changeSelectedFillLayers('shape', false));
      for (const input of [
        dom.transformX, dom.transformY, dom.transformWidth, dom.transformHeight,
        dom.transformRotation, dom.transformOpacity, dom.transformOpacityValue,
      ]) {
        input.addEventListener('change', updateSelectedTransform);
      }
    }

    return {
      removeSelectedVisualItem,
      render: renderInspector,
      wire,
    };
  }

  return { createInspectorUi };
});
