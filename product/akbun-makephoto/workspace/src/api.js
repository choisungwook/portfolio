'use strict';

// The bridge to Rust and the page's shared state. Every script reaches the
// others through window.mp, never through top-level names.

(function () {
  const mp = (window.mp = window.mp || {});
  const { invoke, convertFileSrc } = window.__TAURI__.core;
  const dialog = window.__TAURI__.dialog;

  mp.state = {
    view: { revision: 0, photos: [], tags: [], folders: [] },
    byId: new Map(),
    settings: {},
    looks: [],
    fields: {},
    catalogPath: '',
    cliPath: '',
    version: '',
    mode: 'library',
    filter: { folder: null, tag: null, search: '', minRating: 0, edited: false },
    selection: new Set(),
    anchor: null,
    current: null,
  };

  const listeners = [];
  mp.onView = (fn) => listeners.push(fn);

  /** Take a fresh view from Rust and redraw everything from it. */
  mp.setView = (view) => {
    const previous = mp.state.byId;
    mp.state.view = view;
    mp.state.byId = new Map(view.photos.map((p) => [p.id, p]));
    for (const id of [...mp.state.selection]) if (!mp.state.byId.has(id)) mp.state.selection.delete(id);
    if (mp.state.current != null && !mp.state.byId.has(mp.state.current)) mp.state.current = null;
    for (const fn of listeners) fn(view, previous);
  };

  mp.toast = (text, ms = 3000) => {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(mp.toast.timer);
    mp.toast.timer = setTimeout(() => { el.hidden = true; }, ms);
  };

  mp.toast.hide = () => {
    clearTimeout(mp.toast.timer);
    document.getElementById('toast').hidden = true;
  };

  mp.showError = async (error) => {
    console.error(error);
    await dialog.message(String(error), { title: 'akbun-makephoto', kind: 'error' });
  };

  const call = (name, args) => invoke(name, args);
  const viewCall = async (name, args) => {
    const view = await call(name, args);
    mp.setView(view);
    return view;
  };

  mp.api = {
    convertFileSrc,
    dialog,
    bootstrap: () => call('bootstrap'),
    refresh: () => viewCall('catalog_state'),
    revision: () => call('catalog_revision'),
    importPaths: async (paths) => {
      const result = await call('import_paths', { paths });
      mp.setView(result.view);
      return result.report;
    },
    remove: (ids) => viewCall('remove_photos', { ids }),
    tag: (ids, add, remove) => viewCall('tag_photos', { ids, add, remove }),
    renameTag: (from, to) => viewCall('rename_tag', { from, to }),
    rate: (ids, rating) => viewCall('rate_photos', { ids, rating }),
    relink: (from, to) => viewCall('relink_folder', { from, to }),
    saveEdit: (id, edit) => viewCall('save_edit', { id, edit }),
    /** JPEG bytes as an object URL. The caller revokes it. */
    renderPreview: async (id, edit, maxEdge) => {
      const bytes = await call('render_preview', { id, edit, maxEdge: Math.round(maxEdge) });
      return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    },
    auto: (id, edit, kinds) => call('auto_adjust', { id, edit, kinds }),
    thumbnails: (ids) => call('thumbnails', { ids }),
    exportPhotos: (ids, dir) => call('export_photos', { ids, dir }),
    saveSettings: (settings) => call('save_settings', { settings }),
  };

  mp.checkUpdate = async () => {
    const { check } = window.__TAURI__.updater;
    const { relaunch } = window.__TAURI__.process;
    try {
      const update = await check();
      if (!update) {
        await dialog.message('You are on the latest version.', { title: 'akbun-makephoto' });
        return;
      }
      const install = await dialog.ask(`Version ${update.version} is available. Download and install it now?`, {
        title: 'Update available',
        kind: 'info',
      });
      if (!install) return;
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      await dialog.message(`Cannot check for updates.\n\n${error}`, { title: 'Update failed', kind: 'error' });
    }
  };
})();
