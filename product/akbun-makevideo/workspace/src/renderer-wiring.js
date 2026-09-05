'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.rendererWiringLib = exported;
})(globalThis, function () {
  function createRendererWiring(deps) {
    const {
      L,
      T,
      state,
      dom,
      el,
      rate,
      reportError,
      newProject,
      openProject,
      saveProject,
      importViaDialog,
      deleteProject,
      closeProject,
      undoEdit,
      redoEdit,
      splitAtPlayhead,
      deleteSelected,
      seekTimelineOffset,
      seekPreviousEdit,
      seekNextEdit,
      seekTimelineStart,
      seekTimelineEnd,
      updateMonitorZoomUi,
      startRender,
      fillProxySheet,
      openSheet,
      fillProjectSheet,
      fillAppSheet,
      qualitySmokeConfig,
      accelerationNote,
      compositorNote,
      anySheetOpen,
      closeTimelineContextMenu,
      toggleSelectedPanel,
      refreshDebug,
      setSourceMark,
      placeSource,
      renderSourceMonitor,
      selectAsset,
      zoomToPxPerSecond,
      renderTimeline,
      updatePlayhead,
      toggleSnap,
      toggleClipLink,
      addText,
      addShape,
      addMarker,
      edit,
      addSubtitle,
      importSrt,
      exportSrt,
      renderHeads,
      frameAtClientX,
      openTimelineContextMenu,
      addVisualKeyframesAt,
      addVolumeKeyframeAt,
      setClipLut,
      addAdjustmentLayer,
      addPip,
      persistSettings,
      closeSheet,
      fillGraphicsDevices,
      createProjectFromSheet,
      openProjectPath,
      adoptProxyStatuses,
    } = deps;
    let preview = null;
    let sourcePreview = null;
    let stageController = null;
    let shortcutController = null;
    let inspectorController = null;
    let timelineInteractions = null;

    function setRuntime(runtime) {
      if (Object.hasOwn(runtime, 'preview')) preview = runtime.preview;
      if (Object.hasOwn(runtime, 'sourcePreview')) sourcePreview = runtime.sourcePreview;
      if (Object.hasOwn(runtime, 'stageController')) stageController = runtime.stageController;
      if (Object.hasOwn(runtime, 'shortcutController')) shortcutController = runtime.shortcutController;
      if (Object.hasOwn(runtime, 'inspectorController')) inspectorController = runtime.inspectorController;
      if (Object.hasOwn(runtime, 'timelineInteractions')) timelineInteractions = runtime.timelineInteractions;
    }

    // --- menus -----------------------------------------------------------------

    function closeMenus() {
      for (const list of dom.menus.querySelectorAll('.menu-list')) list.classList.remove('open');
      for (const title of dom.menus.querySelectorAll('.menu-title')) title.classList.remove('open');
      if (preview && !anySheetOpen()) preview.setVisible(true);
    }

    function openMenu(name) {
      const wasOpen = dom.menus.querySelector(`[data-list="${name}"]`).classList.contains('open');
      closeMenus();
      if (wasOpen) return;
      // A menu list can reach over the stage, and the native view would be on top
      // of it. Hidden while one is open, shown again by closeMenus.
      if (preview) preview.setVisible(false);
      dom.menus.querySelector(`[data-list="${name}"]`).classList.add('open');
      dom.menus.querySelector(`[data-menu="${name}"]`).classList.add('open');
    }

    const actions = {
      'new-project': newProject,
      'open-project': openProject,
      'save-project': () => saveProject(false),
      'save-project-as': () => saveProject(true),
      'import-assets': importViaDialog,
      'delete-project': deleteProject,
      'close-project': closeProject,
      undo: undoEdit,
      redo: redoEdit,
      split: splitAtPlayhead,
      'delete-clip': () => deleteSelected(false),
      'ripple-delete': () => deleteSelected(true),
      'toggle-playback': () => preview.toggle(),
      'previous-frame': () => seekTimelineOffset(-1),
      'next-frame': () => seekTimelineOffset(1),
      'previous-second': () => seekTimelineOffset(-Math.round(T.rateToNumber(rate()))),
      'next-second': () => seekTimelineOffset(Math.round(T.rateToNumber(rate()))),
      'previous-edit': seekPreviousEdit,
      'next-edit': seekNextEdit,
      'timeline-start': seekTimelineStart,
      'timeline-end': seekTimelineEnd,
      'monitor-zoom-in': () => { preview.zoomIn(); updateMonitorZoomUi(); },
      'monitor-zoom-out': () => { preview.zoomOut(); updateMonitorZoomUi(); },
      'monitor-fit': () => { preview.fit(); updateMonitorZoomUi(); },
      'monitor-fullscreen': () => stageController.toggleFullscreen(),
      'render-fhd': () => startRender('fhd'),
      'render-4k': () => startRender('4k'),
      'cancel-render': () => window.api.cancelRender(),
      'proxy-media': () => {
        fillProxySheet();
        openSheet('proxy-settings');
      },
      'project-settings': () => {
        fillProjectSheet();
        openSheet('project-settings');
      },
      'app-settings': () => {
        fillAppSheet();
        openSheet('app-settings');
        void globalThis.makevideoAiPanel.refreshStatus();
      },
      'ai-captions': () => {
        if (state.activePanel !== 'ai') toggleSelectedPanel('ai');
        globalThis.makevideoAiEditPanel.showCaptions('captions');
      },
      'ai-silence': () => {
        if (state.activePanel !== 'ai') toggleSelectedPanel('ai');
        globalThis.makevideoAiEditPanel.showCaptions('silence');
      },
      'ai-cancel': () => window.api.aiEditCancel(),
      'shortcut-settings': () => {
        shortcutController.fillSheet();
        openSheet('shortcut-settings');
      },
      'quality-soak': async () => {
        try {
          await globalThis.makevideoQuality.runAndSave();
        } catch (error) {
          await window.api.message(String(error), {
            title: 'Playback quality failed',
            kind: 'error',
          });
        }
      },
      'quality-smoke': async () => {
        try {
          await globalThis.makevideoQuality.runAndSave(qualitySmokeConfig());
        } catch (error) {
          await window.api.message(String(error), {
            title: 'Playback quality failed',
            kind: 'error',
          });
        }
      },
      'check-update': () => window.api.checkUpdate(),
      about: () =>
        window.api.message(
          [
            `akbun-makevideo ${state.boot.version}`,
            `settings: ${state.boot.dataDir}`,
            `ffmpeg: ${state.boot.ffmpeg || 'not found'}`,
            `ffprobe: ${state.boot.ffprobe || 'not found'}`,
            accelerationNote(),
            compositorNote(state.settings.compositor),
          ].join('\n'),
          { title: 'About' }
        ),
    };

    // --- wiring ----------------------------------------------------------------

    function wireMenus() {
      dom.menus.addEventListener('click', (event) => {
        const title = event.target.closest('.menu-title');
        if (title) {
          openMenu(title.dataset.menu);
          return;
        }
        const item = event.target.closest('[data-action]');
        if (!item) return;
        closeMenus();
        const run = actions[item.dataset.action];
        if (run) Promise.resolve().then(run).catch((error) => reportError(error, `menu:${item.dataset.action}`));
      });
      dom.menus.addEventListener('pointerover', (event) => {
        const title = event.target.closest('.menu-title');
        if (!title) return;
        if (!dom.menus.querySelector('.menu-list.open')) return;
        closeMenus();
        openMenu(title.dataset.menu);
      });
      document.addEventListener('pointerdown', (event) => {
        if (!event.target.closest('#menus')) closeMenus();
        if (!event.target.closest('#timeline-context-menu')) closeTimelineContextMenu();
      });
      // The webview brings its own right-click menu, and the first item on it is
      // Reload. The project lives in this page and nowhere else until it is saved,
      // so that one click empties the assets and the timeline with no warning.
      // Text fields keep their menu, because copy and paste belong there.
      document.addEventListener('contextmenu', (event) => {
        if (!event.target.closest('input, textarea')) event.preventDefault();
      });
    }

    function wireSelectedPanel() {
      dom.globalActions.addEventListener('click', (event) => {
        const button = event.target.closest('[data-panel-action]');
        if (button) toggleSelectedPanel(button.dataset.panelAction);
      });
      dom.btnRefreshDebug.addEventListener('click', () => void refreshDebug());
      dom.btnToggleLogs.addEventListener('click', () => {
        dom.debugLog.hidden = !dom.debugLog.hidden;
        dom.btnToggleLogs.textContent = dom.debugLog.hidden ? 'Show error log' : 'Hide error log';
        void refreshDebug();
      });
    }

    function wireAssets() {
      dom.btnImport.addEventListener('click', importViaDialog);
      dom.sourcePlay.addEventListener('click', () => sourcePreview.toggle());
      dom.sourceSeek.addEventListener('input', () => sourcePreview.seek(Number(dom.sourceSeek.value)));
      dom.sourceMarkIn.addEventListener('click', () => setSourceMark('in'));
      dom.sourceMarkOut.addEventListener('click', () => setSourceMark('out'));
      dom.sourceInsert.addEventListener('click', () => placeSource('insert'));
      dom.sourceOverwrite.addEventListener('click', () => placeSource('overwrite'));
      dom.sourceAppend.addEventListener('click', () => placeSource('append'));
      dom.sourcePip.addEventListener('click', addPip);
      for (const input of [dom.sourceVideo, dom.sourceAudio, dom.sourceRipple]) {
        input.addEventListener('change', renderSourceMonitor);
      }
      dom.assetList.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-remove]');
        if (remove) {
          if (state.selectedAssetId === remove.dataset.remove) state.selectedAssetId = null;
          edit({ op: 'removeAsset', assetId: remove.dataset.remove });
          return;
        }
        const item = event.target.closest('.asset');
        if (!item) return;
        selectAsset(item.dataset.id);
      });
      dom.assetList.addEventListener('pointerdown', timelineInteractions.beginAssetDrag);
      dom.sourceStage.addEventListener('pointerdown', timelineInteractions.beginSourceDrag);
      dom.sourceStage.addEventListener('dragstart', (event) => event.preventDefault());
      window.addEventListener('pointermove', (event) => {
        timelineInteractions.updateAssetDrag(event);
        timelineInteractions.updateSourceDrag(event);
      });
      window.addEventListener('pointerup', timelineInteractions.endAssetDrag);
      window.addEventListener('pointerup', (event) => {
        timelineInteractions.endSourceDrag(event)
          .catch((error) => reportError(error, 'source:drop'));
      });
      window.addEventListener('pointercancel', () => {
        timelineInteractions.clearAssetDrag();
        timelineInteractions.clearSourceDrag();
        timelineInteractions.clearToolDrag();
      });
      window.addEventListener('blur', () => {
        timelineInteractions.clearAssetDrag();
        timelineInteractions.clearSourceDrag();
        timelineInteractions.clearToolDrag();
      });
    }

    function wireTimeline() {
      dom.scroll.addEventListener('wheel', timelineInteractions.scrollHorizontally, { passive: false });
      dom.zoom.addEventListener('input', () => {
        const at = preview.position();
        state.pxPerSecond = zoomToPxPerSecond(dom.zoom.value);
        renderTimeline();
        updatePlayhead(at);
      });
      dom.btnSplit.addEventListener('click', splitAtPlayhead);
      dom.btnMagnet.addEventListener('click', toggleSnap);
      dom.btnDelete.addEventListener('click', () => deleteSelected(false));
      dom.btnRipple.addEventListener('click', () => deleteSelected(true));
      dom.btnLink.addEventListener('click', toggleClipLink);
      // Wrapped so the click event never arrives as a placement, and skipped
      // entirely when it is the click that follows a drag.
      dom.btnAddText.addEventListener('click', () => {
        if (!timelineInteractions.tookToolDragClick()) addText();
      });
      for (const button of dom.shapeButtons) {
        button.addEventListener('click', () => {
          if (!timelineInteractions.tookToolDragClick()) addShape(button.dataset.addShape);
        });
        button.addEventListener('pointerdown', (event) => timelineInteractions.beginToolDrag(event, {
          kind: 'shape',
          shape: button.dataset.addShape,
          label: button.textContent.trim(),
        }));
      }
      dom.btnAddText.addEventListener('pointerdown', (event) => timelineInteractions.beginToolDrag(event, {
        kind: 'text',
        label: 'Text',
      }));
      dom.btnAddMarker.addEventListener('click', () => addMarker());
      dom.btnAddVideo.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'video' }));
      dom.btnAddAudio.addEventListener('click', () => edit({ op: 'addTrack', trackKind: 'audio' }));
      dom.btnAddSubtitle.addEventListener('click', async () => {
        await edit({ op: 'addTrack', trackKind: 'subtitle' });
        await addSubtitle();
      });
      dom.btnImportSrt.addEventListener('click', () => importSrt().catch((error) => reportError(error, 'subtitle:import')));
      dom.btnExportSrt.addEventListener('click', () => exportSrt().catch((error) => reportError(error, 'subtitle:export')));

      dom.heads.addEventListener('click', (event) => {
        const target = event.target.closest('[data-target-track]');
        if (target) {
          state.targetTrackId = state.targetTrackId === target.dataset.targetTrack
            ? null
            : target.dataset.targetTrack;
          renderHeads();
          return;
        }
        const button = event.target.closest('[data-toggle]');
        if (!button) return;
        const track = L.findTrack(state.project, button.closest('.head').dataset.trackId);
        if (!track) return;
        const flag = button.dataset.toggle;
        edit({ op: 'setTrackFlags', trackId: track.id, [flag]: !track[flag] });
      });

      dom.ruler.addEventListener('pointerdown', timelineInteractions.beginScrub);
      dom.ruler.addEventListener('click', (event) => {
        const marker = event.target.closest('[data-marker-id]');
        const found = marker && L.findMarker(state.project, marker.dataset.markerId);
        if (found) preview.seek(found.frame);
      });
      dom.ruler.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const frame = Math.round(frameAtClientX(event.clientX));
        openTimelineContextMenu(event, [
          { label: 'Move Playhead Here', run: () => preview.seek(frame) },
          { label: 'Add Marker Here', run: () => addMarker(frame) },
        ]);
      });
      dom.markerList.addEventListener('click', (event) => {
        const seek = event.target.closest('[data-marker-seek]');
        if (seek) {
          const marker = L.findMarker(state.project, seek.dataset.markerSeek);
          if (marker) preview.seek(marker.frame);
          return;
        }
        const remove = event.target.closest('[data-marker-remove]');
        if (remove) edit({ op: 'removeMarker', markerId: remove.dataset.markerRemove });
      });
      dom.markerList.addEventListener('change', (event) => {
        const color = event.target.closest('[data-marker-color]');
        if (color) edit({ op: 'setMarker', markerId: color.dataset.markerColor, color: color.value });
      });
      dom.markerList.addEventListener('focusout', (event) => {
        const name = event.target.closest('[data-marker-name]');
        if (!name) return;
        const marker = L.findMarker(state.project, name.dataset.markerName);
        if (marker && marker.name !== name.value) {
          edit({ op: 'setMarker', markerId: marker.id, name: name.value });
        }
      });
      inspectorController.wire();
      dom.lanes.addEventListener('pointerdown', (event) => {
        const keyframe = event.target.closest('[data-keyframe-type]');
        if (keyframe) {
          if (keyframe.dataset.keyframeType === 'visual') {
            stageController.selectVisualItem(keyframe.dataset.layerId);
          } else {
            stageController.selectClip(keyframe.dataset.layerId);
          }
          state.selectedKeyframe = {
            type: keyframe.dataset.keyframeType,
            layerId: keyframe.dataset.layerId,
            property: keyframe.dataset.keyframeProperty,
            frame: Number(keyframe.dataset.keyframeFrame),
            value: Number(keyframe.dataset.keyframeValue),
            easing: keyframe.dataset.keyframeEasing,
          };
          inspectorController.render();
          event.stopPropagation();
          return;
        }
        const visual = event.target.closest('[data-visual-item-id]');
        if (visual) {
          timelineInteractions.beginVisualItemDrag(event, visual);
          return;
        }
        const clip = event.target.closest('.clip');
        if (clip) {
          timelineInteractions.beginClipDrag(event, clip);
          return;
        }
        stageController.selectClip(null);
        stageController.selectVisualItem(null);
        timelineInteractions.beginScrub(event);
      });
      dom.lanes.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const visual = event.target.closest('[data-visual-item-id]');
        if (visual) {
          stageController.selectVisualItem(visual.dataset.visualItemId);
          const found = L.findVisualItem(state.project, visual.dataset.visualItemId);
          const frame = frameAtClientX(event.clientX);
          openTimelineContextMenu(event, [
            { label: 'Add Transform Keyframes Here', run: () => addVisualKeyframesAt(found.item, frame) },
            { label: 'Delete Layer', run: () => inspectorController.removeSelectedVisualItem() },
          ]);
          return;
        }
        const clip = event.target.closest('.clip');
        if (clip) {
          stageController.selectClip(clip.dataset.clipId);
          const found = L.findClip(state.project, clip.dataset.clipId);
          const frame = frameAtClientX(event.clientX);
          const transition = L.transitionForClip(state.project, clip.dataset.clipId, frame);
          const index = found.track.clips.findIndex((entry) => entry.id === clip.dataset.clipId);
          const next = found.track.clips[index + 1];
          const canAddTransition = found.track.kind === 'video' && next &&
            L.clipEnd(found.clip) === next.start;
          const transitionAction = transition
            ? [{
              label: 'Remove Dissolve',
              run: () => edit({ op: 'removeTransition', transitionId: transition.id }),
            }]
            : canAddTransition
              ? [{
                label: 'Add Dissolve',
                run: () => edit({
                  op: 'addTransition',
                  fromClipId: found.clip.id,
                  toClipId: next.id,
                  duration: Math.max(1, Math.min(
                    Math.round(T.rateToNumber(rate()) / 2),
                    L.clipDuration(found.clip),
                    L.clipDuration(next),
                  )),
                }),
              }]
              : [];
          openTimelineContextMenu(event, [
            { label: 'Add Volume Keyframe Here', run: () => addVolumeKeyframeAt(found.clip, frame) },
            { label: 'Apply 3D LUT…', run: () => setClipLut(clip.dataset.clipId) },
            ...(L.findClip(state.project, clip.dataset.clipId).clip.lutPath
              ? [{ label: 'Remove 3D LUT', run: () => edit({ op: 'setClipLut', clipId: clip.dataset.clipId, lutPath: null }) }]
              : []),
            ...transitionAction,
            { label: 'Delete Clip', run: () => deleteSelected(false) },
            { label: 'Ripple Delete', run: () => deleteSelected(true) },
          ]);
          return;
        }
        const lane = event.target.closest('.lane');
        if (!lane) return;
        const track = L.findTrack(state.project, lane.dataset.trackId);
        const frame = frameAtClientX(event.clientX);
        const gap = L.gapAt(track, frame);
        const actions = [
          ...(track.kind === 'video'
            ? [{ label: 'Add Adjustment Layer…', run: () => addAdjustmentLayer(track, Math.round(frame)) }]
            : []),
          ...(gap
            ? [{
              label: 'Ripple Delete Gap',
              run: () => edit({ op: 'rippleDeleteGap', trackId: track.id, start: gap.start, end: gap.end }),
            }]
            : []),
        ];
        if (!actions.length) return;
        stageController.selectClip(null);
        stageController.selectVisualItem(null);
        openTimelineContextMenu(event, actions);
      });

      window.addEventListener('pointermove', (event) => {
        timelineInteractions.pointerMove(event);
      });
      window.addEventListener('pointerup', (event) => {
        timelineInteractions.pointerUp(event, reportError);
      });
    }

    function wireSheets() {
      document.addEventListener('click', (event) => {
        const close = event.target.closest('[data-close]');
        if (close) closeSheet(close.dataset.close);
      });
      el('ps-preset').addEventListener('change', (event) => {
        if (event.target.value === 'custom') return;
        const [width, height] = event.target.value.split('x');
        el('ps-width').value = width;
        el('ps-height').value = height;
      });
      el('ps-save').addEventListener('click', async () => {
        const at = preview.position();
        const was = rate();
        closeSheet('project-settings');
        // Changing the rate carries every clip with it, so a cut stays where it
        // was in time rather than where it was in frame numbers. That is one
        // command over every clip in the project, and one press of undo back.
        await edit({
          op: 'setSettings',
          settings: {
            width: Math.max(16, Number(el('ps-width').value) || 1920),
            height: Math.max(16, Number(el('ps-height').value) || 1080),
            rate: T.parseRate(el('ps-rate').value),
          },
        });
        preview.seek(T.rescale(at, was, rate()));
        preview.layout();
      });
      // The device list only means anything on the GPU setting, and the sheet says
      // so as soon as the choice is made rather than after it is applied.
      el('as-compositor').addEventListener('change', (event) => {
        el('as-compositor-note').textContent = compositorNote(event.target.value);
        void fillGraphicsDevices();
      });
      el('as-save').addEventListener('click', async () => {
        const silencePaddingText = el('as-silence-padding').value.trim();
        const silencePadding = Number(silencePaddingText);
        const next = Object.assign({}, state.settings, {
          previewQuality: el('as-quality').value,
          previewMuteWhileScrubbing: el('as-scrub-mute').checked,
          snap: el('as-snap').checked,
          showActionSafeArea: el('as-action-safe-area').checked,
          showTitleSafeArea: el('as-title-safe-area').checked,
          showRuleOfThirds: el('as-rule-of-thirds').checked,
          showCenterLines: el('as-center-lines').checked,
          theme: el('as-theme').value,
          compositor: el('as-compositor').value,
          gpuDevice: el('as-gpu-device').value,
          proxyEnabled: state.settings.proxyEnabled,
          renderAcceleration: el('as-accel').value,
          workspaceDir: el('as-workspace').value.trim(),
          deleteProjectFolder: el('as-delete-project-folder').checked,
          ffmpegDir: el('as-ffmpeg').value.trim(),
          logDir: el('as-log-dir').value.trim(),
          logRotationSize: Math.min(
            1024,
            Math.max(1, Math.floor(Number(el('as-log-size').value) || 5)),
          ),
          logRotationUnit: el('as-log-unit').value,
          aiModel: el('as-ai-model').value || 'gpt-5.6-luna',
          aiEffort: el('as-ai-effort').value || 'medium',
          transcriptionProvider: el('as-transcription-provider').value,
          transcriptionEndpoint: el('as-transcription-endpoint').value.trim(),
          transcriptionModel: el('as-transcription-model').value.trim(),
          transcriptionLanguage: el('as-transcription-language').value.trim(),
          silenceThresholdDb: Math.min(-5, Math.max(-80, Number(el('as-silence-threshold').value) || -35)),
          silenceMinDurationMs: Math.min(
            10000,
            Math.max(100, Math.round(Number(el('as-silence-duration').value) || 450)),
          ),
          silencePaddingMs: Math.min(
            2000,
            Math.max(
              0,
              Math.round(silencePaddingText === '' || !Number.isFinite(silencePadding)
                ? 120
                : silencePadding),
            ),
          ),
        });
        closeSheet('app-settings');
        await persistSettings(next, {
          fail: async (error) => {
            reportError(error, 'settings:save');
            await window.api.message(`Those settings could not be saved.\n\n${error}`, {
              title: 'Settings',
              kind: 'error',
            });
          },
        });
      });
      el('shortcut-save').addEventListener('click', async () => {
        const error = el('shortcut-error');
        let shortcutOverrides;
        try {
          shortcutOverrides = shortcutController.collectOverrides();
        } catch (cause) {
          error.textContent = cause.message;
          error.hidden = false;
          return;
        }
        await persistSettings(Object.assign({}, state.settings, { shortcutOverrides }), {
          confirm: () => closeSheet('shortcut-settings'),
          fail: (cause) => {
            reportError(cause, 'settings:shortcuts');
            error.textContent = `Those shortcuts could not be saved. ${cause}`;
            error.hidden = false;
          },
        });
      });
      el('proxy-generate').addEventListener('click', async () => {
        if (!state.path) return;
        try {
          adoptProxyStatuses(await window.api.startProxies(state.path));
        } catch (error) {
          reportError(error, 'proxy:generate');
          await window.api.message(`Proxy generation could not start.\n\n${error}`, {
            title: 'Proxy Media',
            kind: 'error',
          });
        }
      });
      el('proxy-save').addEventListener('click', async () => {
        const next = Object.assign({}, state.settings, {
          proxyEnabled: el('proxy-enabled').checked,
        });
        closeSheet('proxy-settings');
        await persistSettings(next, {
          fail: async (error) => {
            reportError(error, 'settings:proxy');
            await window.api.message(`The proxy setting could not be saved.\n\n${error}`, {
              title: 'Proxy Media',
              kind: 'error',
            });
          },
        });
      });
      el('as-workspace-pick').addEventListener('click', async () => {
        const folder = await window.api.pickFolder('Workspace folder');
        if (folder) el('as-workspace').value = folder;
      });
      el('as-log-dir-pick').addEventListener('click', async () => {
        const folder = await window.api.pickFolder('Error log folder');
        if (folder) el('as-log-dir').value = folder;
      });
      el('np-create').addEventListener('click', createProjectFromSheet);
      el('np-name').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') createProjectFromSheet();
      });
      el('op-list').addEventListener('click', (event) => {
        const row = event.target.closest('[data-path]');
        if (row) openProjectPath(row.dataset.path);
      });
      el('op-browse').addEventListener('click', async () => {
        const path = await window.api.pickProjectOpen();
        if (path) openProjectPath(path);
      });
      dom.renderCancel.addEventListener('click', () => window.api.cancelRender());
      dom.renderClose.addEventListener('click', () => {
        dom.renderOverlay.hidden = true;
      });
      dom.toolWarning.addEventListener('click', () => {
        fillAppSheet();
        openSheet('app-settings');
      });
    }

    function updateToolWarning() {
      dom.toolWarning.hidden = Boolean(state.boot && state.boot.ffmpeg);
      if (!dom.playbackWarning) return;
      dom.playbackWarning.hidden = !state.playbackNotice;
      dom.playbackWarning.textContent = state.playbackNotice
        ? `Playback is using media elements: ${state.playbackNotice}`
        : '';
      // The bar is narrow and the reason can be a sentence, so the element is
      // truncated and the whole of it lives in the tooltip.
      dom.playbackWarning.title = state.playbackNotice || '';
    }

    function subscribe(source, register, handler) {
      try {
        Promise.resolve(register(handler)).catch((error) => reportError(error, source));
      } catch (error) {
        reportError(error, source);
      }
    }

    return { setRuntime, actions, closeMenus, openMenu, wireMenus, wireSelectedPanel, wireAssets, wireTimeline, wireSheets, updateToolWarning, subscribe };
  }

  return { createRendererWiring };
});
