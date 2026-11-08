'use strict';

// The same window.api the Electron preload used to expose, now backed by the
// Tauri commands in src-tauri/src/commands.rs. Keeping the shape is what let
// the pages move to Tauri almost unchanged.
(() => {
  const { invoke } = window.__TAURI__.core;

  window.api = {
    getSettings: () => invoke('settings_get'),
    saveSettings: (settings) =>
      invoke('settings_save', { next: settings }).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error: String(error) })
      ),
    // The page picks the folder; the command only stores the string.
    chooseDir: (current) =>
      window.__TAURI__.dialog.open({ directory: true, defaultPath: current || undefined }),
    listFonts: () => invoke('list_fonts'),
    getPermissions: () => invoke('permissions_get'),
    openScreenPermissionSettings: () => invoke('open_screen_settings'),
    previewImage: () => invoke('preview_image'),
    savePreview: () => invoke('preview_save'),
    copyPreview: () => invoke('preview_copy'),
    closePreview: () => invoke('window_close'),
    editPreview: () => invoke('preview_edit'),
    editorImage: () => invoke('editor_image'),
    saveEditor: (dataUrl) => invoke('editor_save', { dataUrl }),
    saveEditorAs: (dataUrl) => invoke('editor_save_as', { dataUrl }),
    copyEditor: (dataUrl) => invoke('editor_copy', { dataUrl }),
    closeEditor: () => invoke('window_close'),
  };
})();
