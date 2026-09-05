'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.appInitLib = exported;
})(globalThis, function () {
  function createAppInitializer(deps) {
    const {
      DEFAULT_SETTINGS,
      G,
      HANDLE_PX,
      I,
      K,
      L,
      P,
      S,
      T,
      X,
      actions,
      activateSelectedPanel,
      addShape,
      addText,
      adopt,
      applySettings,
      baseName,
      closeMenus,
      closeTimelineContextMenu,
      confirmDiscard,
      dom,
      edit,
      el,
      followPlayhead,
      frameAtClientX,
      hydrateDuration,
      insertSourceAt,
      isDirty,
      liveSelection,
      onProxyStatus,
      onRenderDone,
      onRenderFallback,
      onRenderProgress,
      onWaveformStatus,
      openProjectPath,
      persistSettingsInBackground,
      playbackPath,
      probePaths,
      qualitySmokeConfig,
      rate,
      refresh,
      renderTimeline,
      reportError,
      selectAsset,
      selectedSourceAsset,
      setRuntime,
      snapTolerance,
      sourceDragPayload,
      sourceTime,
      state,
      staysOnCpu,
      subscribe,
      updateLinkUi,
      updateMonitorZoomUi,
      updatePlayhead,
      updateToolWarning,
      wireAssets,
      wireMenus,
      wireSelectedPanel,
      wireSheets,
      wireTimeline,
      zoomToPxPerSecond,
    } = deps;

    async function start() {
      let preview = null;
      let mediaPreview = null;
      let sourcePreview = null;
      let qualityMonitor = null;
      let stageController = null;
      let inspectorController = null;
      let shortcutController = null;
      let timelineInteractions = null;
      let stageResizeObserver = null;
      state.pxPerSecond = zoomToPxPerSecond(dom.zoom.value);

      sourcePreview = globalThis.previewLib.createPreview({
        stage: dom.sourceStage,
        inner: dom.sourceStageInner,
        wrap: dom.sourceStageWrap,
        getProject: () => state.project,
        getAssetPlaybackRange: () => {
          const asset = selectedSourceAsset();
          return asset && state.sourceSelection
            ? S.playbackRange(state.sourceSelection, S.sourceLimitFrames(asset, rate()))
            : null;
        },
        playbackPath,
        onTick: (frame, playing) => {
          dom.sourceClock.textContent = sourceTime(frame);
          dom.sourceSeek.value = String(Math.round(frame));
          dom.sourcePlay.textContent = playing ? '❚❚' : '▶';
        },
      });

      qualityMonitor = globalThis.qualityLib.createQualityMonitor({});
      mediaPreview = globalThis.previewLib.createPreview({
        stage: dom.stage,
        inner: dom.stageInner,
        exactCanvas: dom.stageExact,
        wrap: dom.stageWrap,
        getProject: () => state.project,
        playbackPath,
        qualityMonitor,
        onTick: (frame, playing) => {
          updatePlayhead(frame);
          followPlayhead(frame);
          dom.btnPlay.textContent = playing ? '❚❚' : '▶';
          if (playing) {
            // Playing is the stacked elements; the composited frame cannot keep up
            // and would only freeze one moment over moving video.
            preview.clearExact();
            stageController.setStageMode('live');
          } else {
            stageController.scheduleExactFrame();
          }
        },
      });

      // Everything below still says `preview`, and on the media element engine that
      // is exactly what it is. On the native one the router forwards the transport
      // to Rust instead and leaves the rest — the asset preview, the quality
      // setting, the element pool — where it was.
      preview = globalThis.monitorLib.createMonitor({
        preview: mediaPreview,
        stage: dom.stage,
        // The panel is what the native place is computed from, so the view and the
        // page's own stage come out of one calculation rather than two.
        wrap: dom.stageWrap,
        api: window.api,
        getProject: () => state.project,
        onNotice: (reason) => {
          state.playbackNotice = reason;
          updateToolWarning();
        },
        onTick: (frame, playing) => {
          updatePlayhead(frame);
          followPlayhead(frame);
          dom.btnPlay.textContent = playing ? '❚❚' : '▶';
          // Nothing to schedule and nothing to badge: the monitor draws the frame
          // under a stopped playhead with the same compositor it plays with.
          stageController.setStageMode(null);
        },
      });

      shortcutController = globalThis.keyboardUiLib.createKeyboardUi({
        K,
        actions,
        closeMenus,
        closeTimelineContextMenu,
        document,
        el,
        exitProgramMonitorFullscreen: () => Boolean(
          stageController && stageController.exitFullscreen()
        ),
        reportError,
        state,
        window,
      });

      stageController = globalThis.programMonitorUiLib.createProgramMonitorUi({
        G,
        I,
        L,
        T,
        X,
        api: window.api,
        deferTimelineOverlaySync: () => Boolean(
          timelineInteractions && timelineInteractions.deferOverlaySync()
        ),
        dom,
        edit,
        getPreview: () => preview,
        persistSettingsInBackground,
        rate,
        refresh,
        renderInspector: () => inspectorController && inspectorController.render(),
        reportError,
        state,
        staysOnCpu,
        updateLinkUi,
        updateMonitorZoomUi,
      });

      inspectorController = globalThis.inspectorUiLib.createInspectorUi({
        I,
        L,
        P,
        activateSelectedPanel,
        api: window.api,
        baseName,
        dom,
        edit,
        getPreview: () => preview,
        liveSelection,
        orderedStops: stageController.orderedStops,
        reportError,
        selectVisualItem: stageController.selectVisualItem,
        selectedVisualItem: stageController.selectedVisualItem,
        state,
      });

      timelineInteractions = globalThis.timelineInteractionsLib.createTimelineInteractions({
        HANDLE_PX,
        L,
        api: window.api,
        baseName,
        dom,
        edit,
        frameAtClientX,
        getPreview: () => preview,
        getSourceDrag: sourceDragPayload,
        hydrateDuration,
        insertSourceAt,
        probePaths,
        rate,
        renderTimeline,
        selectAsset,
        selectClip: stageController.selectClip,
        selectVisualItem: stageController.selectVisualItem,
        snapTolerance,
        syncEditorOverlay: stageController.syncEditorOverlay,
        addText,
        addShape,
        state,
      });

      if (typeof ResizeObserver === 'function') {
        stageResizeObserver = new ResizeObserver(() => {
          stageController.renderStageOverlay();
          stageController.drawStageVisuals();
          preview.place();
        });
        stageResizeObserver.observe(dom.stage);
      }

      setRuntime({
        preview,
        mediaPreview,
        sourcePreview,
        qualityMonitor,
        stageController,
        inspectorController,
        shortcutController,
        timelineInteractions,
        stageResizeObserver,
      });

      await applySettings(state.settings);
      globalThis.makevideoQuality = globalThis.qualityLib.createQualityHarness({
        monitor: qualityMonitor,
        preview,
        getProject: () => state.project,
        // The harness hides and mutes tracks to measure what each one costs, and
        // that is an edit like any other, so it goes over the same wire.
        setTrackFlags: (trackId, flags) => edit(Object.assign({ op: 'setTrackFlags', trackId }, flags)),
        memoryBytes: window.api.processMemoryBytes,
        saveReport: window.api.saveQualityReport,
      });
      updateToolWarning();

      wireMenus();
      wireSelectedPanel();
      wireAssets();
      wireTimeline();
      stageController.wireTransport();
      wireSheets();
      shortcutController.wire();

      subscribe('events:render-progress', window.api.onRenderProgress, onRenderProgress);
      subscribe('events:render-done', window.api.onRenderDone, onRenderDone);
      subscribe('events:render-fallback', window.api.onRenderFallback, onRenderFallback);
      subscribe('events:proxy-status', window.api.onProxyStatus, onProxyStatus);
      subscribe('events:waveform-status', window.api.onWaveformStatus, onWaveformStatus);
      subscribe('events:file-drop', window.api.onFileDrop, (payload) => {
        Promise.resolve(timelineInteractions.handleOsDrop(payload))
          .catch((error) => reportError(error, 'file-drop'));
      });
      subscribe('events:close-requested', window.api.onCloseRequested, async (event) => {
        if (isDirty()) {
          if (event && event.preventDefault) event.preventDefault();
          if (!(await confirmDiscard('Quit'))) return;
        }
        window.api.closeWindow();
      });
      window.addEventListener('resize', () => {
        renderTimeline();
        // The window moving or resizing moves the stage, and the native view is
        // placed in the window rather than laid out by the page.
        if (preview) preview.place();
      });

      refresh();

      try {
        adopt(await window.api.editState());
        state.savedRevision = state.doc.revision;
        refresh();
      } catch (error) {
        reportError(error, 'edit-state');
      }

      try {
        state.boot = await window.api.bootstrap();
        state.settings = { ...DEFAULT_SETTINGS, ...state.boot.settings };
        await applySettings(state.settings);
        updateToolWarning();
        refresh();
      } catch (error) {
        reportError(error, 'bootstrap');
        dom.toolWarning.hidden = false;
        dom.toolWarning.textContent = 'Initialization failed';
        dom.toolWarning.title = 'Open Settings to inspect the error log location';
      }

      await globalThis.makevideoAiPanel.initialize({
        project: () => state.project,
        version: () => state.boot.version,
      });

      // The system's font families, for the text inspectors' pickers. Off the
      // boot path on purpose: reading every font file's name takes long enough to
      // notice, and nothing before the first font edit needs the list.
      Promise.resolve(window.api.listFonts())
        .then((families) => {
          if (!dom.fontOptions || !Array.isArray(families)) return;
          dom.fontOptions.textContent = '';
          for (const family of families) {
            const option = document.createElement('option');
            option.value = family;
            dom.fontOptions.appendChild(option);
          }
        })
        .catch(() => {});

      if (state.boot.qualityProject && state.boot.qualityReport) {
        window.setTimeout(async () => {
          if (!(await openProjectPath(state.boot.qualityProject))) return;
          const config = state.boot.qualitySmoke ? qualitySmokeConfig() : undefined;
          const report = await globalThis.makevideoQuality.runAll(config);
          await window.api.writeQualityReport(state.boot.qualityReport, report);
          window.api.closeWindow();
        }, 250);
      }
    }


    return { start };
  }

  return { createAppInitializer };
});
