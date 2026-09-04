'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.rendererAssetsUiLib = exported;
})(globalThis, function () {
  function createRendererAssetsUi(deps) {
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
      edit,
      adopt,
      reportError,
      errorText,
    } = deps;
    let preview = null;
    let sourcePreview = null;
    let timelineInteractions = null;
    let stageController = null;
    const renderLanes = (...args) => deps.renderLanes(...args);
    const refresh = (...args) => deps.refresh(...args);
    function selectMadeOnTrack(made, trackId) {
      if (!made || !made.length || !stageController) return;
      const selected = made.find((clipId) => {
        const found = L.findClip(state.project, clipId);
        return found && found.track.id === trackId;
      });
      stageController.selectClip(selected || made[0]);
    }

    function setRuntime(runtime) {
      if (Object.hasOwn(runtime, 'preview')) preview = runtime.preview;
      if (Object.hasOwn(runtime, 'sourcePreview')) sourcePreview = runtime.sourcePreview;
      if (Object.hasOwn(runtime, 'timelineInteractions')) timelineInteractions = runtime.timelineInteractions;
      if (Object.hasOwn(runtime, 'stageController')) stageController = runtime.stageController;
    }

    // --- assets ----------------------------------------------------------------

    function assetSummary(asset) {
      const bits = [asset.kind];
      if (asset.durationMs > 0) {
        bits.push(L.formatTimecode(T.framesFromMillis(asset.durationMs, rate()), rate()));
      }
      if (asset.width > 0) bits.push(`${asset.width}×${asset.height}`);
      if (asset.kind === 'video' && !asset.hasAudio) bits.push('silent');
      const proxy = state.proxies[asset.id];
      if (proxy) {
        if (proxy.state === 'original') bits.push(proxy.reason || 'original playback');
        else if (proxy.state === 'ready') bits.push(`proxy ready · ${proxy.reason}`);
        else if (proxy.state === 'failed') bits.push(`proxy failed · ${proxy.reason}`);
        else if (proxy.state === 'inspecting') bits.push(`proxy inspecting · ${proxy.reason}`);
        else if (proxy.state === 'waiting') bits.push(`proxy waiting · ${proxy.reason}`);
        else if (proxy.state === 'paused') bits.push(`proxy paused at ${proxy.percent || 0}% · ${proxy.reason}`);
        else bits.push(`proxy ${proxy.percent || 0}% · ${proxy.reason}`);
        if (proxy.message) bits.push(proxy.message);
      }
      return bits.join(' · ');
    }

    function playbackPath(asset) {
      if (!state.settings.proxyEnabled) return asset.path;
      const proxy = state.proxies[asset.id];
      return proxy && proxy.state === 'ready' && proxy.path ? proxy.path : asset.path;
    }

    function adoptProxyStatuses(statuses) {
      state.proxies = Object.fromEntries((statuses || []).map((status) => [status.assetId, status]));
      renderAssets();
      renderProxySummary();
      renderProxyProgress();
    }

    function proxySummary() {
      const statuses = Object.values(state.proxies);
      if (!state.path) return 'Save the project before creating proxies.';
      if (!statuses.length) return 'No video media to assess.';
      const candidates = statuses.filter((status) => status.state !== 'original');
      if (!candidates.length) return 'All video media can play directly.';
      const count = (name) => statuses.filter((status) => status.state === name).length;
      const ready = count('ready');
      const remaining = count('inspecting') + count('queued') + count('waiting') + count('generating') + count('paused');
      const held = count('waiting') + count('paused');
      const failed = count('failed');
      return [
        `${ready} ready`,
        remaining ? `${remaining} remaining` : '',
        held ? `${held} paused for playback` : '',
        failed ? `${failed} failed` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }

    function renderProxySummary() {
      const summary = el('proxy-summary');
      if (summary) summary.textContent = proxySummary();
    }

    function renderProxyProgress() {
      const statuses = Object.values(state.proxies);
      const active = statuses.filter((status) =>
        ['inspecting', 'queued', 'waiting', 'generating', 'paused'].includes(status.state));
      if (!active.length) {
        dom.proxyProgress.hidden = true;
        return;
      }
      const held = active.filter((status) => status.state === 'waiting' || status.state === 'paused');
      const inspecting = active.filter((status) => status.state === 'inspecting');
      const percent = Math.round(active.reduce((total, status) => total + (status.percent || 0), 0) / active.length);
      dom.proxyProgress.textContent = held.length
        ? `Proxy paused for playback · ${active.length} remaining`
        : inspecting.length
          ? `Inspecting proxy media · ${active.length} remaining`
          : `Proxy ${percent}% · ${active.length} remaining`;
      dom.proxyProgress.hidden = false;
    }

    let debugTimer = null;
    let debugRefreshInFlight = false;

    function byteText(value) {
      if (!Number.isFinite(value)) return 'unavailable';
      return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
    }

    function millisecondsText(value) {
      return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'unavailable';
    }

    function playbackDebugLines(status) {
      if (!status) return ['Native playback: not attached'];
      return [
        `Native frames: ${status.presented} presented, ${status.skipped} skipped, ${status.resynced} resynced`,
        `Native source: ${status.starved} starved, ${status.failedFrames} display failures`,
        `Native display call: ${millisecondsText(status.lastPresentMs)} last, ${millisecondsText(status.peakPresentMs)} peak`,
        `Native A/V lateness: ${millisecondsText(status.lastLateMs)} last, ${millisecondsText(status.peakLateMs)} peak`,
        `Native viewport: ${status.viewportGeometry || 'unavailable'}`,
      ];
    }

    function clipDragDebugLines() {
      const clipDragMetrics = timelineInteractions
        ? timelineInteractions.metrics
        : {};
      const text = (value) => Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'not measured';
      return [
        `Timeline drag next frame: ${text(clipDragMetrics.nextFrameMs)} last, ${text(clipDragMetrics.peakNextFrameMs)} peak`,
        `Timeline drag first move queue: ${text(clipDragMetrics.firstMoveQueueMs)} last, ${text(clipDragMetrics.peakFirstMoveQueueMs)} peak`,
      ];
    }

    async function refreshDebug() {
      if (dom.debugPanel.hidden || debugRefreshInFlight) return;
      debugRefreshInFlight = true;
      try {
        const [metrics, playback, logs] = await Promise.all([
          window.api.processMetrics(),
          window.api.playbackStatus(),
          dom.debugLog.hidden ? Promise.resolve(null) : window.api.readErrorLog(),
        ]);
        const active = Object.values(state.proxies).filter((status) =>
          ['inspecting', 'queued', 'waiting', 'generating', 'paused'].includes(status.state));
        dom.debugMetrics.textContent = [
          `Process tree CPU: ${Number.isFinite(metrics.cpuPercent) ? `${metrics.cpuPercent.toFixed(1)}%` : 'unavailable'}`,
          `Process tree memory: ${byteText(metrics.memoryBytes)}`,
          `Timeline: ${state.project.tracks.length} tracks, ${state.project.assets.length} assets`,
          `Proxy jobs: ${active.length} active, ${Object.keys(state.proxies).length} known`,
          `Compositor: ${state.settings.compositor || 'not read yet'}`,
          ...clipDragDebugLines(),
          ...playbackDebugLines(playback),
          `IPC proxy updates: percentage-throttled`,
        ].join('\n');
        if (logs !== null) dom.debugLog.textContent = logs || 'No error log entries.';
      } catch (error) {
        reportError(error, 'debug:refresh');
        dom.debugMetrics.textContent = `Debug data unavailable\n${errorText(error)}`;
      } finally {
        debugRefreshInFlight = false;
      }
    }

    function startDebug() {
      void refreshDebug();
      if (debugTimer === null) debugTimer = window.setInterval(() => void refreshDebug(), 1000);
    }

    function stopDebug() {
      if (debugTimer !== null) window.clearInterval(debugTimer);
      debugTimer = null;
    }

    const PANEL_TITLES = {
      inspector: 'Inspector',
      shape: 'Shape',
      marker: 'Marker',
      debug: 'Debug',
    };

    function activateSelectedPanel(panel) {
      state.activePanel = panel;
      dom.selectedPanel.hidden = !panel;
      dom.upper.classList.toggle('panel-open', Boolean(panel));
      dom.inspectorView.hidden = panel !== 'inspector';
      dom.shapeToolView.hidden = panel !== 'shape';
      dom.markerToolView.hidden = panel !== 'marker';
      dom.debugPanel.hidden = panel !== 'debug';
      dom.selectedPanelTitle.textContent = panel ? PANEL_TITLES[panel] : 'Inspector';
      for (const button of dom.globalActions.querySelectorAll('[data-panel-action]')) {
        const active = button.dataset.panelAction === panel;
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('aria-expanded', String(Boolean(panel)));
      }
      if (panel === 'debug') startDebug();
      else stopDebug();
      window.requestAnimationFrame(() => {
        if (preview) preview.layout();
        if (sourcePreview) sourcePreview.layout();
      });
    }

    function toggleSelectedPanel(panel) {
      activateSelectedPanel(P.toggledPanel(state.activePanel, panel));
    }

    async function prepareProxies() {
      if (!state.path || !window.api.available) return;
      try {
        adoptProxyStatuses(await window.api.startProxies(state.path));
      } catch (error) {
        reportError(error, 'proxy:start');
      }
    }

    function adoptWaveformStatuses(statuses) {
      state.waveforms = Object.fromEntries((statuses || []).map((status) => [status.assetId, status]));
      renderLanes();
    }

    async function prepareWaveforms() {
      if (!state.path || !window.api.available) return;
      try {
        adoptWaveformStatuses(await window.api.startWaveforms(state.path));
      } catch (error) {
        reportError(error, 'waveform:start');
      }
    }

    function prepareDerivedMedia() {
      prepareProxies();
      prepareWaveforms();
    }

    function onProxyStatus(statuses) {
      const becameReady = (statuses || []).some((status) => {
        const before = state.proxies[status.assetId];
        return status.state === 'ready' && (!before || before.state !== 'ready');
      });
      adoptProxyStatuses(statuses);
      if (becameReady && preview) {
        void Promise.resolve(preview.refreshMedia()).catch((error) => reportError(error, 'proxy:refresh'));
      }
    }

    function onWaveformStatus(statuses) {
      if (!(statuses || []).length) {
        state.waveforms = {};
      } else {
        for (const status of statuses) state.waveforms[status.assetId] = status;
      }
      renderLanes();
    }

    function renderAssets() {
      dom.assetList.textContent = '';
      const fragment = document.createDocumentFragment();
      for (const asset of state.project.assets) {
        const item = document.createElement('li');
        item.className = 'asset';
        item.dataset.id = asset.id;
        item.title = asset.path;
        if (asset.id === state.selectedAssetId) item.classList.add('selected');

        const name = document.createElement('span');
        name.className = 'asset-name';
        name.textContent = asset.name || baseName(asset.path);
        const meta = document.createElement('span');
        meta.className = 'asset-meta';
        meta.textContent = assetSummary(asset);
        const remove = document.createElement('button');
        remove.className = 'asset-remove';
        remove.dataset.remove = asset.id;
        remove.title = 'Remove this asset and its clips';
        remove.textContent = '×';

        item.append(name, meta, remove);
        fragment.appendChild(item);
      }
      dom.assetList.appendChild(fragment);
      dom.assetEmpty.hidden = state.project.assets.length > 0;
    }

    function selectedSourceAsset() {
      return state.selectedAssetId ? L.findAsset(state.project, state.selectedAssetId) : null;
    }

    function sourceTime(frame) {
      return L.formatTimecode(Math.max(0, Math.round(frame || 0)), rate());
    }

    function renderSourceMonitor() {
      const asset = selectedSourceAsset();
      if (state.selectedAssetId && !asset) {
        state.selectedAssetId = null;
        state.sourceSelection = null;
        if (sourcePreview) sourcePreview.showAsset(null);
      }
      const selection = asset && (state.sourceSelection || S.selectionFor(asset, rate()));
      const limit = asset ? S.sourceLimitFrames(asset, rate()) : 0;
      if (selection) state.sourceSelection = selection;
      dom.sourceHint.hidden = Boolean(asset);
      dom.sourceClock.textContent = sourceTime(sourcePreview ? sourcePreview.position() : 0);
      dom.sourceDuration.textContent = sourceTime(limit);
      dom.sourceSeek.max = String(Math.max(1, limit));
      dom.sourceSeek.value = String(Math.min(limit, Math.round(sourcePreview ? sourcePreview.position() : 0)));
      dom.sourceSeek.disabled = !asset || asset.kind === 'image';
      dom.sourceMarkerLayer.hidden = !selection || !asset || asset.kind === 'image';
      if (selection) {
        dom.sourceInMarker.style.left = `${S.markerPercent(selection.inPoint, limit)}%`;
        dom.sourceOutMarker.style.left = `${S.markerPercent(selection.outPoint, limit)}%`;
        const shade = S.rangeShade(selection, limit);
        dom.sourceBeforeRange.style.width = `${shade.beforePercent}%`;
        dom.sourceAfterRange.style.width = `${shade.afterPercent}%`;
      }
      dom.sourceRange.textContent = selection
        ? `${sourceTime(selection.inPoint)} – ${sourceTime(selection.outPoint)}`
        : `${sourceTime(0)} – ${sourceTime(0)}`;
      const canVideo = Boolean(asset) && (asset.kind === 'video' || asset.kind === 'image');
      const canAudio = Boolean(asset) &&
        (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio));
      dom.sourceVideo.disabled = !canVideo;
      dom.sourceAudio.disabled = !canAudio;
      if (!canVideo) dom.sourceVideo.checked = false;
      if (!canAudio) dom.sourceAudio.checked = false;
      dom.sourcePlay.disabled = !asset || asset.kind === 'image';
      dom.sourceMarkIn.disabled = !asset || asset.kind === 'image';
      dom.sourceMarkOut.disabled = !asset || asset.kind === 'image';
      const command = asset && S.commandFor('insert', state.project, asset, selection, {
        video: dom.sourceVideo.checked,
        audio: dom.sourceAudio.checked,
        targetTrackId: state.targetTrackId,
        start: preview ? preview.position() : 0,
      });
      for (const button of [dom.sourceInsert, dom.sourceOverwrite, dom.sourceAppend]) {
        button.disabled = !command;
      }
    }

    function setSourceMark(which) {
      const asset = selectedSourceAsset();
      if (!asset || !state.sourceSelection || !sourcePreview) return;
      const at = Math.round(sourcePreview.position());
      state.sourceSelection = which === 'in'
        ? S.markIn(state.sourceSelection, at)
        : S.markOut(state.sourceSelection, at, S.sourceLimitFrames(asset, rate()));
      renderSourceMonitor();
    }

    function sourceDragPayload() {
      const asset = selectedSourceAsset();
      if (!asset || !state.sourceSelection) return null;
      const video = dom.sourceVideo.checked && !dom.sourceVideo.disabled;
      const audio = dom.sourceAudio.checked && !dom.sourceAudio.disabled;
      if (!video && !audio) return null;
      return {
        asset,
        selection: { ...state.sourceSelection },
        video,
        audio,
        rippleAllTracks: dom.sourceRipple.value === 'all',
      };
    }

    async function insertSourceAt(source, trackId, start) {
      const command = S.commandFor('insert', state.project, source.asset, source.selection, {
        video: source.video,
        audio: source.audio,
        targetTrackId: trackId,
        start,
        rippleAllTracks: source.rippleAllTracks,
      });
      if (!command) return;
      const made = await edit(command);
      selectMadeOnTrack(made, trackId);
    }

    async function placeSource(mode) {
      const asset = selectedSourceAsset();
      if (!asset || !state.sourceSelection) return;
      const command = S.commandFor(mode, state.project, asset, state.sourceSelection, {
        video: dom.sourceVideo.checked,
        audio: dom.sourceAudio.checked,
        targetTrackId: state.targetTrackId,
        start: preview.position(),
        rippleAllTracks: dom.sourceRipple.value === 'all',
      });
      if (!command) return;
      const made = await edit(command);
      selectMadeOnTrack(made, command.videoTrackId || command.audioTrackId);
    }

    /** An asset whose length ffprobe could not report is measured by the browser
     *  instead, once. Without this every clip of it would be five seconds long.
     *
     *  Learning a file's real length is not an edit and is not undoable, so it goes
     *  in through its own command rather than as one more thing on the stack. */
    function hydrateDuration(asset) {
      if (asset.durationMs > 0 || asset.kind === 'image') return;
      const probe = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
      probe.preload = 'metadata';
      probe.src = window.api.fileUrl(asset.path);
      probe.addEventListener('loadedmetadata', async () => {
        if (!Number.isFinite(probe.duration) || probe.duration <= 0) return;
        const live = L.findAsset(state.project, asset.id);
        if (!live || live.durationMs > 0) return;
        try {
          adopt(
            await window.api.describeAsset(
              asset.id,
              Math.round(probe.duration * 1000),
              probe.videoWidth || 0,
              probe.videoHeight || 0
            )
          );
        } catch (error) {
          // The asset went away between the load starting and finishing. There is
          // nothing to say about it and nothing to fix.
          return;
        }
        refresh();
      });
    }

    /** What a set of paths turns out to be. Nothing is imported yet: the caller
     *  decides what command that becomes, so dropping files on a track can put the
     *  import and the clips into one undo step. */
    async function probePaths(paths) {
      if (!paths || !paths.length) return [];
      const found = await window.api.importAssets(paths);
      if (!found.length) {
        await window.api.message('None of those files are video, audio or images.', {
          title: 'Nothing imported',
        });
      }
      return found;
    }

    async function importViaDialog() {
      const picked = await window.api.pickMedia();
      if (!picked) return;
      const found = await probePaths(Array.isArray(picked) ? picked : [picked]);
      if (!found.length) return;
      await edit({ op: 'addAssets', assets: found });
      for (const asset of found) hydrateDuration(asset);
    }

    return { setRuntime, assetSummary, playbackPath, adoptProxyStatuses, proxySummary, renderProxySummary, renderProxyProgress, byteText, millisecondsText, playbackDebugLines, clipDragDebugLines, refreshDebug, startDebug, stopDebug, activateSelectedPanel, toggleSelectedPanel, prepareProxies, adoptWaveformStatuses, prepareWaveforms, prepareDerivedMedia, onProxyStatus, onWaveformStatus, renderAssets, selectedSourceAsset, sourceTime, renderSourceMonitor, setSourceMark, sourceDragPayload, insertSourceAt, placeSource, hydrateDuration, probePaths, importViaDialog };
  }

  return { createRendererAssetsUi };
});
