'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.rendererProjectUiLib = exported;
})(globalThis, function () {
  function createRendererProjectUi(deps) {
    const {
      L,
      T,
      DEFAULT_SETTINGS,
      state,
      dom,
      el,
      adopt,
      edit,
      hydrateDuration,
      isDirty,
      reportError,
      errorText,
      projectDir,
      projectName,
      persistLatestSettings,
    } = deps;
    let preview = null;
    let mediaPreview = null;
    let sourcePreview = null;
    let stageController = null;
    let shortcutController = null;
    const refresh = (...args) => deps.refresh(...args);
    const prepareDerivedMedia = (...args) => deps.prepareDerivedMedia(...args);
    const adoptProxyStatuses = (...args) => deps.adoptProxyStatuses(...args);
    const renderProxySummary = (...args) => deps.renderProxySummary(...args);
    const renderProxyProgress = (...args) => deps.renderProxyProgress(...args);
    const renderTimeline = (...args) => deps.renderTimeline(...args);
    const rate = (...args) => deps.rate(...args);
    const updateMonitorZoomUi = (...args) => deps.updateMonitorZoomUi(...args);
    const updateTitle = (...args) => deps.updateTitle(...args);
    const updateToolWarning = (...args) => deps.updateToolWarning(...args);

    function setRuntime(runtime) {
      if (Object.hasOwn(runtime, 'preview')) preview = runtime.preview;
      if (Object.hasOwn(runtime, 'mediaPreview')) mediaPreview = runtime.mediaPreview;
      if (Object.hasOwn(runtime, 'sourcePreview')) sourcePreview = runtime.sourcePreview;
      if (Object.hasOwn(runtime, 'stageController')) stageController = runtime.stageController;
      if (Object.hasOwn(runtime, 'shortcutController')) shortcutController = runtime.shortcutController;
    }

/** Persist a setting changed from a toolbar or the transport, where there is no
 *  sheet to report into.
 *
 *  These are one-click toggles, so blocking on the write would make the button
 *  feel slow for something that has already visibly happened. What must not
 *  happen is an unhandled rejection: the whole toolbar is put back to the last
 *  backend-confirmed boot settings and the reason is shown. An earlier
 *  optimistic value may itself have been superseded, so it is not a rollback
 *  point. `bootstrap` is the source of truth on the next launch either way.
 */
function persistSettings(settings = state.settings, callbacks) {
  return persistLatestSettings({ ...settings }, callbacks);
}

function persistSettingsInBackground() {
  void persistSettings().catch((error) => {
    reportError(error, 'settings:persist:callback');
  });
}

function toggleSnap() {
  state.settings.snap = !state.settings.snap;
  dom.btnMagnet.classList.toggle('on', state.settings.snap);
  persistSettingsInBackground();
}

    // --- render ----------------------------------------------------------------

    async function startRender(preset) {
      if (state.rendering) return;
      if (!state.boot || !state.boot.ffmpeg) {
        await window.api.message(
          'Rendering needs ffmpeg. Install it with `brew install ffmpeg`, then reopen the app, ' +
            'or point Settings → Preview & Tools at the folder that holds it.',
          { title: 'ffmpeg not found', kind: 'error' }
        );
        return;
      }
      if (L.projectDurationFrames(state.project) <= 0) {
        await window.api.message('The timeline is empty.', { title: 'Nothing to render' });
        return;
      }
      // Renders land next to the project by default, so a project folder ends up
      // holding the edit and what came out of it.
      const dir = projectDir();
      const file = `${projectName().toLowerCase().replace(/\s+/g, '-')}-${preset}.mp4`;
      const output = await window.api.pickRenderOutput(dir ? `${dir}/${file}` : file);
      if (!output) return;

      state.rendering = true;
      preview.pause();
      const hardware =
        state.settings.renderAcceleration !== 'cpu' &&
        state.boot.acceleration &&
        state.boot.acceleration.available;
      dom.renderTitle.textContent = hardware
        ? `Rendering ${preset.toUpperCase()} on ${hardware.label}`
        : `Rendering ${preset.toUpperCase()} on the CPU`;
      dom.renderStatus.textContent = 'Starting ffmpeg…';
      dom.renderBar.style.width = '0%';
      dom.renderCancel.hidden = false;
      dom.renderClose.hidden = true;
      dom.renderOverlay.hidden = false;
      try {
        // No project goes with the request. Rust takes its own copy of the
        // document and remembers which revision it took, so an edit made while
        // this runs cannot half reach the file being written.
        await window.api.startRender(output, preset);
      } catch (error) {
        reportError(error, 'render:start');
        state.rendering = false;
        dom.renderOverlay.hidden = true;
        await window.api.message(String(error), { title: 'Render failed', kind: 'error' });
      }
    }

    function onRenderProgress(payload) {
      if (!state.rendering) return;
      // ffmpeg reports where it has got to in milliseconds, which is all a
      // progress bar needs; it becomes frames only to be read out as a timecode.
      const percent = payload.totalMs > 0 ? Math.min(100, (payload.positionMs / payload.totalMs) * 100) : 0;
      const clock = (ms) => L.formatTimecode(T.framesFromMillis(ms, rate()), rate());
      dom.renderBar.style.width = `${percent}%`;
      dom.renderStatus.textContent = `${clock(payload.positionMs)} of ${clock(payload.totalMs)} — ${Math.round(percent)}%`;
    }

    /** The hardware encoder failed on this particular file, so the CPU is redoing
     *  it from the start. Saying so beats a progress bar that jumps back to zero
     *  for no visible reason. */
    function onRenderFallback(payload) {
      if (!state.rendering) return;
      dom.renderTitle.textContent = 'Rendering on the CPU';
      dom.renderStatus.textContent = `${payload.from} could not encode this one. Starting again with libx264…`;
      dom.renderBar.style.width = '0%';
    }

    function onRenderDone(payload) {
      state.rendering = false;
      dom.renderCancel.hidden = true;
      dom.renderClose.hidden = false;
      if (payload.ok) {
        dom.renderBar.style.width = '100%';
        dom.renderTitle.textContent = 'Render finished';
        const how = payload.fellBack
          ? ' (the CPU finished it after the hardware encoder failed)'
          : payload.accelerator
            ? ` (${payload.accelerator})`
            : '';
        // Editing during a render is allowed, so the file can be of a timeline
        // that no longer exists. Saying so beats letting somebody compare the
        // output against what is on screen and conclude the render is broken.
        const stale = payload.edited
          ? '\nThe timeline was edited while this was running, so the file is the timeline as it was when the render started.'
          : '';
        dom.renderStatus.textContent = `${payload.path}${how}${stale}`;
      } else {
        dom.renderTitle.textContent = payload.cancelled ? 'Render cancelled' : 'Render failed';
        dom.renderStatus.textContent = payload.message || '';
        if (!payload.cancelled) reportError(payload.message || 'Render failed', 'render');
      }
    }

    // --- project files ---------------------------------------------------------

    async function confirmDiscard(what) {
      if (!isDirty()) return true;
      return window.api.ask(`This project has unsaved changes. ${what} anyway?`, {
        title: 'Unsaved changes',
        kind: 'warning',
      });
    }

    /** Take on a document Rust has just opened or made, and reset everything the
     *  page keeps alongside it. The history belongs to the document, so opening a
     *  project starts with nothing to undo. */
    function loadDocument(doc, path) {
      stageController.resetDocumentUi();
      adopt(doc);
      state.path = path || null;
      state.savedRevision = doc.revision;
      state.selectedClipId = null;
      state.selectedVisualItemId = null;
      state.selectedKeyframe = null;
      state.selectedAssetId = null;
      state.sourceSelection = null;
      state.targetTrackId = null;
      state.proxies = {};
      state.waveforms = {};
      preview.clear();
      preview.showTimeline();
      if (sourcePreview) {
        sourcePreview.clear();
        sourcePreview.showAsset(null);
      }
      for (const asset of state.project.assets) hydrateDuration(asset);
      refresh();
      prepareDerivedMedia();
      // A monitor is built for the project it draws — the output size and the
      // clips are read when the frame source is made — so opening a different one
      // means a new session rather than a reused one.
      attachMonitor(true);
    }

    /** A project is a folder under the workspace, so New asks for a name rather
     *  than for a place to put a file. The folder is made now and the project file
     *  written straight away, so the project has a home before the first import. */
    async function newProject() {
      if (!(await confirmDiscard('Start a new project'))) return;
      el('np-name').value = '';
      el('np-error').hidden = true;
      el('np-where').textContent = `A folder will be made in ${state.boot.workspace}`;
      openSheet('new-project');
      el('np-name').focus();
    }

    async function createProjectFromSheet() {
      const error = el('np-error');
      try {
        const entry = await window.api.createProject(el('np-name').value);
        closeSheet('new-project');
        loadDocument(await window.api.newDocument(), entry.path);
        // Written immediately: an empty folder with no project file in it would not
        // show up in Open, and would look like the project was never made.
        await window.api.saveProject(entry.path);
        updateTitle();
      } catch (failure) {
        reportError(failure, 'project:create');
        error.textContent = String(failure);
        error.hidden = false;
      }
    }

    async function openProject() {
      if (!(await confirmDiscard('Open another project'))) return;
      const projects = await window.api.listProjects();
      const list = el('op-list');
      list.textContent = '';
      for (const entry of projects) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.className = 'project-row';
        button.dataset.path = entry.path;
        const name = document.createElement('span');
        name.textContent = entry.name;
        const when = document.createElement('span');
        when.className = 'project-when';
        when.textContent = entry.modifiedMs ? new Date(entry.modifiedMs).toLocaleString() : '';
        button.append(name, when);
        item.appendChild(button);
        list.appendChild(item);
      }
      el('op-empty').hidden = projects.length > 0;
      el('op-where').textContent = state.boot.workspace;
      openSheet('open-project');
    }

    async function openProjectPath(path) {
      closeSheet('open-project');
      try {
        const doc = await window.api.openProject(path);
        // Anything that is not a document is a failure, whether or not it arrived
        // as one: the browser fallback answers null rather than throwing, and
        // handing that to loadDocument would take the page down with a type error
        // instead of showing why the project would not open.
        if (!doc || !doc.project) throw new Error(`${path} could not be opened.`);
        loadDocument(doc, path);
        return true;
      } catch (error) {
        reportError(error, 'project:open');
        await window.api.message(String(error), { title: 'Cannot open', kind: 'error' });
        return false;
      }
    }

    function qualitySmokeConfig() {
      return {
        continuousMs: 5000,
        restartCount: 2,
        restartPlayMs: 1000,
        restartPauseMs: 100,
        trackStepMs: 1000,
        seekCount: 3,
        seekIntervalMs: 300,
      };
    }

    async function saveProject(forcePicker) {
      let path = state.path;
      if (!path || forcePicker) {
        const dir = projectDir();
        const suggested = `${projectName() === 'Untitled' ? 'untitled' : projectName()}.akbunvideo`;
        path = await window.api.pickProjectSave(dir ? `${dir}/${suggested}` : suggested);
        if (!path) return false;
      }
      try {
        await window.api.saveProject(path);
        state.path = path;
        prepareDerivedMedia();
        // What is on disk is this revision, which is what makes the dot go away —
        // and come back the moment anything else is done.
        state.savedRevision = state.doc.revision;
        updateTitle();
        return true;
      } catch (error) {
        reportError(error, 'project:save');
        await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
        return false;
      }
    }

    async function closeProject() {
      if (!(await confirmDiscard('Close this project'))) return;
      loadDocument(await window.api.newDocument(), null);
    }

    async function deleteProject() {
      if (!state.path) return;
      const name = projectName();
      const deleteFolder = state.settings.deleteProjectFolder;
      const message = deleteFolder
        ? `Move “${name}” project folder to Trash?\n\nThe project folder, project work file, generated proxies, and renders will be deleted. Imported source media will not be deleted.`
        : `Move “${name}” project work file to Trash?\n\nOnly the project work file will be deleted. The project folder, generated proxies, renders, and imported source media will remain.`;
      const confirmed = await window.api.ask(
        message,
        { title: 'Delete Project', kind: 'warning' },
      );
      if (!confirmed) return;

      preview.clear();
      await preview.release();
      try {
        await window.api.deleteProject(state.path);
        loadDocument(await window.api.newDocument(), null);
      } catch (error) {
        reportError(error, 'project:delete');
        preview.showTimeline();
        refresh();
        attachMonitor(true);
        await window.api.message(String(error), { title: 'Cannot delete project', kind: 'error' });
      }
    }

    // --- settings sheets -------------------------------------------------------

    function openSheet(id) {
      el(id).hidden = false;
      // The monitor is a native view over the webview and is not in the page's
      // stacking order, so a sheet drawn over the stage would be behind it.
      if (preview) preview.setVisible(false);
    }

    function closeSheet(id) {
      el(id).hidden = true;
      if (preview && !anySheetOpen()) preview.setVisible(true);
    }

    /** Whether anything is still drawn over the stage. Sheets can be stacked —
     *  Settings opens over the project sheet — so closing one is not the same as
     *  the stage being clear. */
    function anySheetOpen() {
      return Boolean(document.querySelector('.sheet:not([hidden])'));
    }

    function fillProjectSheet() {
      const { width, height } = state.project.settings;
      el('ps-width').value = width;
      el('ps-height').value = height;
      el('ps-rate').value = T.rateRatio(rate());
      const key = `${width}x${height}`;
      const preset = el('ps-preset');
      preset.value = [...preset.options].some((option) => option.value === key) ? key : 'custom';
    }

    /** What the machine was found to have, in a sentence. "No hardware encoder"
     *  on its own is the kind of answer nobody can act on, so the reason each
     *  candidate was rejected comes with it. */
    function accelerationNote() {
      const probe = (state.boot && state.boot.acceleration) || { available: null, tried: [] };
      if (probe.available) {
        const decode = probe.available.hwaccel ? `, decoding with ${probe.available.hwaccel}` : '';
        return `Encoding on ${probe.available.label} (${probe.available.encoder})${decode}.`;
      }
      if (!state.boot || !state.boot.ffmpeg) {
        return 'ffmpeg was not found, so nothing could be tested.';
      }
      if (!probe.tried.length) {
        return 'This ffmpeg build has no hardware encoder this app can use. Rendering on the CPU.';
      }
      const reasons = probe.tried
        .filter((item) => !item.works)
        .map((item) => `${item.label} — ${item.note}`)
        .join(' · ');
      return `No usable hardware encoder. ${reasons}`;
    }

    /** Whether the setting says to composite the project frame on the CPU.
     *
     *  Mirrors `stays_on_cpu` in Rust, and for the same reason: this one answer
     *  decides the exact frame and the render, and asking the question in several
     *  places is how those answers drift apart. The native monitor stays attached
     *  for both choices; CPU composition still uploads its finished picture to the
     *  display. Only "cpu" is cpu — older "auto" and "ffmpeg" values mean GPU. */
    function staysOnCpu() {
      return state.settings.compositor === 'cpu';
    }

    /** What the one setting decides, all three of them, in the order they matter.
     *
     *  Takes the setting rather than reading it, because the sheet has to describe
     *  the choice being made and everywhere else has to describe the one in force. */
    function compositorNote(setting) {
      const found = (state.boot && state.boot.compositor) || {};
      if (setting === 'cpu') {
        if (state.playbackNotice) {
          return `The CPU combines the layers, but the native monitor could not start: ${state.playbackNotice}. The older preview is playing instead.`;
        }
        return 'The CPU combines the layers while the native monitor keeps playing. A graphics device only displays the finished picture; ffmpeg still decodes, renders and encodes.';
      }
      const both =
        'The stage and the render come out of the same shader, so what is on screen is what lands in the file. Playback draws straight onto a surface in the window with the audio clock deciding when.';
      const drawing = found.device || 'the software compositor';
      // Both of these are the GPU setting not getting what it asked for, so neither
      // may claim the surface and the shared shader that only the working path has.
      if (state.playbackNotice) {
        return `Drawing with ${drawing}, but the monitor would not start: ${state.playbackNotice}. The older preview is playing instead.`;
      }
      if (found.fellBack) {
        return `No graphics device was found, so ${drawing} draws the exact frame and the older preview plays. The render still comes out of ffmpeg.`;
      }
      return `Drawing with ${drawing}. ${both}`;
    }

    /** Fill the graphics device list from what the machine actually has.
     *
     *  Asked for when the sheet opens rather than at boot: enumerating adapters
     *  opens the graphics stack, and the answer is only ever looked at here. The
     *  saved name is kept as an option even when it is missing, so a settings file
     *  carried from another machine shows what it asked for instead of silently
     *  reading as Auto. */
    async function fillGraphicsDevices() {
      const select = el('as-gpu-device');
      const note = el('as-gpu-device-note');
      const chosen = state.settings.gpuDevice || '';
      let devices = [];
      try {
        devices = (await window.api.graphicsDevices()) || [];
      } catch (error) {
        devices = [];
      }
      const names = devices.map((device) => device.name);
      select.textContent = '';
      select.appendChild(new Option('Auto — whichever the system picks', ''));
      for (const device of devices) {
        select.appendChild(new Option(`${device.name} — ${device.kind}, ${device.backend}`, device.name));
      }
      if (chosen && !names.includes(chosen)) {
        select.appendChild(new Option(`${chosen} — not on this machine`, chosen));
      }
      select.value = chosen;
      // The sheet's own pending choice, not the saved one. CPU composition uses an
      // automatic presentation device, so there is no compositor device to pick.
      const onCpu = el('as-compositor').value === 'cpu';
      select.disabled = onCpu;
      const drawing = (state.boot && state.boot.compositor && state.boot.compositor.device) || 'nothing yet';
      if (!devices.length) {
        note.textContent = 'No graphics device was found, so there is nothing to choose between.';
        return;
      }
      note.textContent = onCpu
        ? 'The CPU combines the frame; an automatic graphics device only displays the result.'
        : `Drawing on ${drawing}. A change switches after the replacement picture is ready.`;
    }

    function fillAppSheet() {
      el('as-quality').value = state.settings.previewQuality;
      el('as-scrub-mute').checked = state.settings.previewMuteWhileScrubbing;
      el('as-snap').checked = state.settings.snap;
      el('as-action-safe-area').checked = state.settings.showActionSafeArea;
      el('as-title-safe-area').checked = state.settings.showTitleSafeArea;
      el('as-rule-of-thirds').checked = state.settings.showRuleOfThirds;
      el('as-center-lines').checked = state.settings.showCenterLines;
      el('as-theme').value = state.settings.theme;
      el('as-workspace').value = state.settings.workspaceDir;
      el('as-delete-project-folder').checked = state.settings.deleteProjectFolder;
      el('as-workspace-note').textContent = `Projects are folders in ${state.boot.workspace}. Imported media stays where it is — nothing is copied in here.`;
      // Rust's normalised answer rather than the stored string. A settings file
      // written when this was three choices holds "auto" or "ffmpeg", and putting
      // either into a two option select would show no selection at all.
      el('as-compositor').value = state.boot.compositor.setting;
      el('as-compositor-note').textContent = compositorNote(el('as-compositor').value);
      fillGraphicsDevices();
      el('as-accel').value = state.settings.renderAcceleration;
      el('as-accel-note').textContent = accelerationNote();
      el('as-ffmpeg').value = state.settings.ffmpegDir;
      el('as-tools').textContent = state.boot.ffmpeg
        ? `Found ffmpeg at ${state.boot.ffmpeg}`
        : 'ffmpeg was not found. Rendering is unavailable until it is.';
      el('as-log-dir').value = state.settings.logDir;
      el('as-log-size').value = state.settings.logRotationSize;
      el('as-log-unit').value = state.settings.logRotationUnit;
      const logDir = state.boot.logDir || 'the operating system application log folder';
      el('as-log-note').textContent = `Only errors are written to ${logDir}/errors.log. The previous file is kept as errors.log.1.`;
    }

    function fillProxySheet() {
      el('proxy-enabled').checked = state.settings.proxyEnabled;
      renderProxySummary();
      el('proxy-generate').disabled = !state.path || !window.api.available;
    }

    function applySettings(next) {
      // Never alias state.boot.settings: toolbar changes are optimistic, while the
      // boot copy is the last backend-confirmed rollback point.
      state.settings = { ...next };
      shortcutController.renderLabels();
      preview.setQuality(next.previewQuality);
      preview.setMuteWhileScrubbing(next.previewMuteWhileScrubbing);
      dom.previewQuality.value = next.previewQuality;
      dom.btnMagnet.classList.toggle('on', next.snap);
      stageController.syncEditorOverlay();
      stageController.renderStageOverlay();
      stageController.drawStageVisuals();
      // Rust applies settings to an active session before saveSettings returns.
      // The idempotent attach is only needed when there is no native monitor yet,
      // including the first bootstrap and a change away from media elements.
      if (!preview.usesNativeMonitor()) return attachMonitor(false);
      return Promise.resolve();
    }

    /** Ask Rust for a monitor, or give the one that is running a new box.
     *
     *  Called when a project opens, when the playback setting changes and when the
     *  window settles after a layout. `restart` is reserved for a different
     *  project; settings are reconfigured inside the running Rust session. */
    async function attachMonitor(restart) {
      if (!preview) return;
      if (restart) {
        state.playbackNotice = null;
        await preview.release();
      }
      await preview.attach();
      // Attaching decides whether guides belong to Rust or the page. Re-evaluate
      // after the answer so native guides never leave the surface hidden behind an
      // exact DOM frame, while a media-element fallback still draws them here.
      stageController.syncEditorOverlay();
      stageController.renderStageOverlay();
      updateToolWarning();
      updateMonitorZoomUi();
      // Which engine is running decides who draws the text and shape layers, and
      // the answer only arrives here. Switching to the media elements has to put
      // the page's own copy back on the stage; switching away has to take it off.
      stageController.drawStageVisuals();
      stageController.scheduleExactFrame();
      // The note carries the fallback reason when a monitor refused to start, and
      // that is only known once the attach has answered.
      el('as-compositor-note').textContent = compositorNote(state.settings.compositor);
    }

    return { setRuntime, persistSettings, persistSettingsInBackground, toggleSnap, startRender, onRenderProgress, onRenderFallback, onRenderDone, confirmDiscard, loadDocument, newProject, createProjectFromSheet, openProject, openProjectPath, qualitySmokeConfig, saveProject, closeProject, deleteProject, openSheet, closeSheet, anySheetOpen, fillProjectSheet, accelerationNote, staysOnCpu, compositorNote, fillGraphicsDevices, fillAppSheet, fillProxySheet, applySettings, attachMonitor };
  }

  return { createRendererProjectUi };
});
