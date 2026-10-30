'use strict';

// Menus, shortcuts, modes, import and export, settings, and the poll that
// picks up changes the CLI made. One action table serves the menu bar, the
// buttons and the keyboard.

(function () {
  const mp = window.mp;
  const lib = globalThis.makephotoLib;
  const $ = (id) => document.getElementById(id);
  const s = mp.state;
  const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'bmp', 'gif', 'heic', 'heif',
    'raf', 'arw', 'cr2', 'cr3', 'nef', 'nrw', 'orf', 'rw2', 'dng', 'pef', 'srw', 'raw'];

  let copiedEdit = null;

  // --- modes -----------------------------------------------------------------

  function setMode(mode) {
    if (mode === 'edit' && !s.current) {
      const first = [...s.selection][0] ?? mp.library.visiblePhotos()[0]?.id;
      if (first == null) return;
      s.current = first;
    }
    if (mode !== 'edit' && mp.editor.cropping) mp.crop.cancel();
    if (mode !== 'edit') mp.level.cancel();
    s.mode = mode;
    document.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('[data-mode-button]')) b.classList.toggle('active', b.dataset.modeButton === mode);
    if (mode === 'edit') mp.editor.open(s.current);
    else mp.library.render();
  }

  function openEditor(id) {
    s.current = id;
    setMode('edit');
  }

  const targetIds = () => (s.selection.size ? [...s.selection] : s.current ? [s.current] : []);

  // --- import / export -------------------------------------------------------

  async function importPaths(paths) {
    if (!paths?.length) return;
    mp.toast('Importing…', 60000);
    try {
      const report = await mp.api.importPaths(paths);
      const parts = [`${report.added.length} added`];
      if (report.existing) parts.push(`${report.existing} already in the catalog`);
      if (report.skipped) parts.push(`${report.skipped} skipped (not photos)`);
      mp.toast(parts.join(', '));
      if (report.added.length) {
        s.filter = { ...s.filter, folder: null, tag: null, edited: false };
        s.selection = new Set([report.added[0]]);
        mp.library.render();
      }
    } catch (error) {
      mp.toast.hide();
      mp.showError(error);
    }
  }

  async function importFolder() {
    const picked = await mp.api.dialog.open({ directory: true, multiple: true, title: 'Import folders' });
    importPaths(Array.isArray(picked) ? picked : picked ? [picked] : []);
  }

  async function importPhotos() {
    const picked = await mp.api.dialog.open({
      multiple: true,
      title: 'Import photos',
      filters: [{ name: 'Photos', extensions: IMAGE_EXTENSIONS }],
    });
    importPaths(Array.isArray(picked) ? picked : picked ? [picked] : []);
  }

  async function exportSelected() {
    const ids = targetIds();
    if (!ids.length) return mp.toast('Select photos to export first.');
    const dir = await mp.api.dialog.open({ directory: true, title: `Export ${ids.length} photo(s) to…` });
    if (!dir) return;
    mp.toast(`Exporting ${ids.length} photo(s)…`, 120000);
    try {
      const result = await mp.api.exportPhotos(ids, dir);
      mp.toast(`Exported ${result.written.length} to ${lib.shortPath(dir)}`);
      if (result.failed.length) mp.showError(`Some photos could not be exported:\n\n${result.failed.join('\n')}`);
    } catch (error) {
      mp.showError(error);
    }
  }

  async function removeSelected() {
    const ids = targetIds();
    if (!ids.length) return;
    const ok = await mp.api.dialog.ask(
      `Remove ${ids.length} photo(s) from the catalog? Their tags and edits are forgotten. The files themselves are not deleted.`,
      { title: 'Remove from Catalog', kind: 'warning' },
    );
    if (!ok) return;
    try {
      await mp.api.remove(ids);
      if (s.mode === 'edit' && !s.current) setMode('library');
    } catch (error) {
      mp.showError(error);
    }
  }

  // --- edits across photos ---------------------------------------------------

  function copyEdit() {
    const photo = s.byId.get(s.current ?? [...s.selection][0]);
    if (!photo) return;
    copiedEdit = s.mode === 'edit' ? mp.editor.edit : photo.edit;
    mp.toast('Edit copied. Select photos and choose Paste Edit.');
  }

  async function pasteEdit() {
    if (!copiedEdit) return mp.toast('Copy an edit first.');
    const ids = targetIds();
    try {
      // Crops and turns belong to one picture; paste only the look of it.
      for (const id of ids) {
        const own = s.byId.get(id).edit;
        await mp.api.saveEdit(id, { ...copiedEdit, crop: own.crop, rotate: own.rotate, straighten: own.straighten });
      }
      if (s.mode === 'edit') mp.editor.open(s.current);
      mp.toast(`Pasted onto ${ids.length} photo(s).`);
    } catch (error) {
      mp.showError(error);
    }
  }

  async function resetEdit() {
    if (s.mode === 'edit') return mp.editor.commit({ ...lib.DEFAULT_EDIT });
    for (const id of targetIds()) await mp.api.saveEdit(id, { ...lib.DEFAULT_EDIT }).catch(mp.showError);
  }

  // --- appearance --------------------------------------------------------------

  // "system" follows the OS; the corner switch pins light or dark and saves it.
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const theme = s.settings.theme;
    const light = theme === 'light' || (theme === 'system' && !systemDark.matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
  }
  systemDark.addEventListener('change', applyTheme);

  async function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    s.settings = { ...s.settings, theme: next };
    applyTheme();
    s.settings = await mp.api.saveSettings(s.settings);
  }

  // --- sheets ----------------------------------------------------------------

  function openSheet(id) {
    closeMenus();
    $(id).hidden = false;
  }

  function openSettings() {
    $('setting-theme').value = s.settings.theme;
    $('setting-quality').value = s.settings.export_quality;
    $('setting-quality-value').textContent = s.settings.export_quality;
    $('setting-catalog').textContent = s.catalogPath;
    openSheet('app-settings');
  }

  const linkCommand = () => `mkdir -p ~/.local/bin && ln -sf "${s.cliPath}" ~/.local/bin/makephoto`;

  // --- action table ----------------------------------------------------------

  const actions = {
    'import-folder': importFolder,
    'import-photos': importPhotos,
    export: exportSelected,
    remove: removeSelected,
    undo: () => mp.editor.undo(),
    redo: () => mp.editor.redo(),
    'select-all': () => {
      s.selection = new Set(mp.library.visiblePhotos().map((p) => p.id));
      mp.library.render();
    },
    'copy-edit': copyEdit,
    'paste-edit': pasteEdit,
    'reset-edit': resetEdit,
    'auto-all': () => (s.mode === 'edit' ? mp.editor.autoAll() : s.selection.size && openEditor([...s.selection][0])),
    'rotate-left': () => s.mode === 'edit' && mp.editor.rotate(-1),
    'rotate-right': () => s.mode === 'edit' && mp.editor.rotate(1),
    crop: () => (s.mode === 'edit' ? mp.crop.start() : s.selection.size && openEditor([...s.selection][0])),
    level: () => s.mode === 'edit' && mp.level.start(),
    'mode-library': () => setMode('library'),
    'mode-edit': () => setMode('edit'),
    'before-after': () => s.mode === 'edit' && mp.editor.toggleOriginal(),
    'prev-photo': () => s.mode === 'edit' && mp.editor.neighbor(-1),
    'next-photo': () => s.mode === 'edit' && mp.editor.neighbor(1),
    'app-settings': openSettings,
    'cli-info': () => {
      $('cli-link').textContent = linkCommand();
      openSheet('cli-info');
    },
    'toggle-theme': toggleTheme,
    'check-update': () => mp.checkUpdate(),
    about: () => mp.api.dialog.message(
      `akbun-makephoto ${s.version}\n\nPhotos stay where they are and are never changed. Edits are kept in the catalog and applied when you export.`,
      { title: 'About akbun-makephoto' },
    ),
  };
  for (const n of [0, 1, 2, 3, 4, 5]) actions[`rate-${n}`] = () => mp.library.rate(n);

  function run(name) {
    closeMenus();
    // Any other command leaves level mode without saving the angle.
    if (mp.level.active && name !== 'level' && name !== 'toggle-theme') mp.level.cancel();
    const fn = actions[name];
    if (fn) Promise.resolve(fn()).catch(mp.showError);
  }

  // --- menus -----------------------------------------------------------------

  function closeMenus() {
    for (const el of document.querySelectorAll('.menu-list.open, .menu-title.open')) el.classList.remove('open');
  }

  document.addEventListener('click', (e) => {
    const title = e.target.closest('.menu-title');
    if (title) {
      const list = document.querySelector(`[data-list="${title.dataset.menu}"]`);
      const wasOpen = list.classList.contains('open');
      closeMenus();
      if (!wasOpen) { list.classList.add('open'); title.classList.add('open'); }
      return;
    }
    const button = e.target.closest('[data-action]');
    if (button && !button.disabled) return run(button.dataset.action);
    const close = e.target.closest('[data-close]');
    if (close) $(close.dataset.close).hidden = true;
    if (!e.target.closest('.menu')) closeMenus();
  });

  // Moving across titles while one menu is open switches menus, as a native bar does.
  document.addEventListener('mouseover', (e) => {
    const title = e.target.closest('.menu-title');
    if (!title || !document.querySelector('.menu-list.open') || title.classList.contains('open')) return;
    closeMenus();
    document.querySelector(`[data-list="${title.dataset.menu}"]`).classList.add('open');
    title.classList.add('open');
  });

  // --- keyboard --------------------------------------------------------------

  function shortcut(e) {
    const cmd = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (cmd && e.shiftKey && k === 'z') return 'redo';
    if (cmd && k === 'z') return 'undo';
    if (cmd && e.shiftKey && k === 'i') return 'import-folder';
    if (cmd && k === 'i') return 'import-photos';
    if (cmd && k === 'e') return 'export';
    if (cmd && k === 'a') return 'select-all';
    if (cmd && k === ',') return 'app-settings';
    if (cmd && e.shiftKey && k === 'c') return 'copy-edit';
    if (cmd && e.shiftKey && k === 'v') return 'paste-edit';
    if (cmd || e.altKey) return null;
    if (e.shiftKey && k === 'a') return 'auto-all';
    if (e.shiftKey) return null;
    return {
      e: 'mode-edit', g: 'mode-library', c: 'crop', l: 'level', '[': 'rotate-left', ']': 'rotate-right',
      arrowleft: 'prev-photo', arrowright: 'next-photo', backspace: 'remove', delete: 'remove',
      0: 'rate-0', 1: 'rate-1', 2: 'rate-2', 3: 'rate-3', 4: 'rate-4', 5: 'rate-5',
    }[k] ?? null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenus();
      for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
      if (mp.editor.cropping) mp.crop.cancel();
      mp.level.cancel();
      return;
    }
    if (e.key === 'Enter' && mp.editor.cropping) return mp.crop.done();
    if (e.key === 'Enter' && mp.level.active) return mp.level.ok();
    // Typing in a field must not split, delete or rate anything.
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === '\\') {
      e.preventDefault();
      if (s.mode === 'edit') mp.editor.setOriginal(true);
      return;
    }
    const name = shortcut(e);
    if (!name) return;
    e.preventDefault();
    run(name);
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === '\\' && s.mode === 'edit') mp.editor.setOriginal(false);
  });

  // --- settings and CLI sheets -----------------------------------------------

  $('setting-quality').addEventListener('input', (e) => { $('setting-quality-value').textContent = e.target.value; });
  $('settings-save').onclick = async () => {
    try {
      s.settings = await mp.api.saveSettings({
        theme: $('setting-theme').value,
        export_quality: Number($('setting-quality').value),
      });
      applyTheme();
      $('app-settings').hidden = true;
    } catch (error) { mp.showError(error); }
  };
  $('cli-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(linkCommand());
      mp.toast('Copied. Paste it into Terminal.');
    } catch (_) {
      mp.toast('Select the command and copy it by hand.');
    }
  };

  // --- startup ---------------------------------------------------------------

  let polls = 0;
  async function poll() {
    try {
      const revision = await mp.api.revision();
      const offline = s.view.photos.some((p) => p.missing);
      polls += 1;
      if (revision !== s.view.revision || (offline && polls % 5 === 0)) await mp.api.refresh();
    } catch (error) {
      console.error('poll', error);
    }
    setTimeout(poll, 2000);
  }

  async function start() {
    const boot = await mp.api.bootstrap();
    Object.assign(s, {
      settings: boot.settings,
      looks: boot.looks,
      fields: Object.fromEntries(boot.fields.map((f) => [f.name, f])),
      catalogPath: boot.catalog_path,
      cliPath: boot.cli_path,
      version: boot.version,
    });
    applyTheme();
    mp.editor.buildControls();
    mp.setView(boot.view);
    setMode('library');
    window.__TAURI__.webview.getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') importPaths(event.payload.paths);
    });
    setTimeout(poll, 2000);
    // Plugging a drive in changes no catalog revision, so look again on focus.
    window.addEventListener('focus', () => mp.api.refresh().catch(console.error));
  }

  mp.app = { openEditor, setMode };
  start().catch(mp.showError);
})();
