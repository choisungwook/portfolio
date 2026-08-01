'use strict';

// The only bridge between the page and the operating system.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs
// no bundler and the app keeps its no-build-step property. Everything that
// touches the file system is a command in commands.rs; what happens here is
// picking files, asking questions, and the native context menu.
//
// Every mutating command answers with the whole library, and this file hands
// that to one change handler. The page therefore never has to merge a partial
// update into its own copy.

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { open: openDialog, message, ask } = window.__TAURI__.dialog;
const { Menu } = window.__TAURI__.menu;

const PHOTO_AND_VIDEO = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'tif', 'tiff',
  'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg',
];

let onChange = () => {};

// Hand the snapshot a command returned to the page, and pass it on so a caller
// that wants the value still gets it.
function changed(snapshot) {
  onChange(snapshot);
  return snapshot;
}

async function checkUpdate() {
  const { check } = window.__TAURI__.updater;
  const { relaunch } = window.__TAURI__.process;
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'akbun-folderview' });
      return;
    }
    const install = await ask(
      `Version ${update.version} is available. Download and install it now?`,
      { title: 'Update available', kind: 'info' }
    );
    if (!install) return;

    // Downloads the installer, runs it, and replaces the app. On Windows the
    // plugin exits the app itself once the installer is launched, because the
    // running exe is the one being replaced, so the line below is never
    // reached there. It stays because it is what makes this correct anywhere
    // else, and because losing it would be a silent bug on a future platform.
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    await message(`Cannot check for updates.\n\n${error}`, {
      title: 'Update failed',
      kind: 'error',
    });
  }
}

window.api = {
  // Local file into a URL the webview will load. Without this the page would
  // ask for file:// and WebView2 would refuse it.
  fileUrl: (path) => convertFileSrc(path),

  onLibraryChanged: (handler) => {
    onChange = handler;
  },

  getLibrary: () => invoke('get_library'),

  // The picker runs in the page rather than in Rust. A blocking native dialog
  // inside a command is a threading hazard, and this way the command receives
  // a path and does one job.
  addFolder: async () => {
    const path = await openDialog({ directory: true, title: 'Add Folder' });
    if (!path) return null;
    return changed(await invoke('add_folder', { path }));
  },

  addFiles: async () => {
    const paths = await openDialog({
      multiple: true,
      title: 'Add Files',
      filters: [{ name: 'Photos and Videos', extensions: PHOTO_AND_VIDEO }],
    });
    if (!paths || paths.length === 0) return null;
    return changed(await invoke('add_files', { paths }));
  },

  rescan: async () => changed(await invoke('rescan')),
  removeRoot: async (path) => changed(await invoke('remove_root', { path })),
  updateEntry: async (path, patch) => changed(await invoke('update_entry', { path, patch })),

  openEntry: (path) => invoke('open_entry', { path }),
  revealEntry: (path) => invoke('reveal_entry', { path }),
  copyPath: (path) => invoke('copy_path', { path }),
  openDataDir: () => invoke('open_data_dir'),

  renameEntry: async (path, newName) => {
    try {
      changed(await invoke('rename_entry', { path, newName }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },

  // Confirm before a delete, because the alternative is a mis-click that the
  // user only notices later. The file goes to the Recycle Bin either way.
  deleteEntry: async (path) => {
    const confirmed = await ask(`Move this file to the Recycle Bin?\n\n${path}`, {
      title: 'Delete',
      kind: 'warning',
    });
    if (!confirmed) return { ok: false };
    try {
      changed(await invoke('delete_entry', { path }));
      return { ok: true };
    } catch (error) {
      await message(String(error), { title: 'Delete failed', kind: 'error' });
      return { ok: false, error: String(error) };
    }
  },

  // A real system menu. Each item runs the handler directly rather than the
  // menu resolving a promise, because there is no dismissed event to settle a
  // promise with when the user clicks away.
  //
  // tags is [{ tag, on }]: every tag in the library, checked when this file
  // has it. Clicking one toggles it; New Tag… is for a tag that does not
  // exist yet, which needs typing and therefore the Properties dialog.
  entryMenu: async (run, tags = []) => {
    const item = (id, text) => ({ id, text, action: () => run(id) });
    const tagItems = tags.map(({ tag, on }) => ({
      text: tag,
      checked: on,
      action: () => run(`tag:${tag}`),
    }));
    const menu = await Menu.new({
      items: [
        item('open', 'Open'),
        item('rename', 'Rename…'),
        item('delete', 'Delete'),
        { item: 'Separator' },
        {
          text: 'Tags',
          items: [
            ...tagItems,
            ...(tagItems.length > 0 ? [{ item: 'Separator' }] : []),
            item('newTag', 'New Tag…'),
          ],
        },
        { item: 'Separator' },
        item('copyPath', 'Copy Path'),
        item('reveal', 'Show in Folder'),
        { item: 'Separator' },
        item('properties', 'Properties'),
      ],
    });
    await menu.popup();
  },

  // The page draws the thumbnail on a canvas and hands the JPEG bytes over.
  saveThumb: (name, bytes) => invoke('save_thumb', { name, bytes }),

  // Distinct from Rescan on purpose: Rescan walks the disk for file changes,
  // this throws away the cached thumbnails so they are rebuilt from originals.
  refreshThumbs: async () => {
    const confirmed = await ask(
      'Throw away all cached thumbnails?\n\nThey are rebuilt from the original files as cards come into view, so the originals must be reachable.',
      { title: 'Refresh Thumbnails' }
    );
    if (!confirmed) return false;
    try {
      await invoke('clear_thumbs');
      return true;
    } catch (error) {
      await message(String(error), { title: 'Refresh failed', kind: 'error' });
      return false;
    }
  },

  saveSettings: (settings) => invoke('save_settings', { settings }),
  checkUpdate,
};
