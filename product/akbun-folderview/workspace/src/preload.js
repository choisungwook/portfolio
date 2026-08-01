'use strict';

// The only bridge between the page and the operating system. The renderer runs
// with contextIsolation on and no node integration, so this list is the whole
// surface it can reach.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addFolder: () => ipcRenderer.invoke('library:addFolder'),
  addFiles: () => ipcRenderer.invoke('library:addFiles'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  removeRoot: (rootPath) => ipcRenderer.invoke('library:removeRoot', rootPath),

  updateEntry: (filePath, patch) => ipcRenderer.invoke('entry:update', filePath, patch),
  openEntry: (filePath) => ipcRenderer.invoke('entry:open', filePath),
  revealEntry: (filePath) => ipcRenderer.invoke('entry:reveal', filePath),
  copyPath: (filePath) => ipcRenderer.invoke('entry:copyPath', filePath),
  renameEntry: (filePath, newName) => ipcRenderer.invoke('entry:rename', filePath, newName),
  deleteEntry: (filePath) => ipcRenderer.invoke('entry:delete', filePath),
  entryMenu: () => ipcRenderer.invoke('entry:menu'),

  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  openDataDir: () => ipcRenderer.invoke('settings:openDataDir'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),

  onLibraryChanged: (handler) =>
    ipcRenderer.on('library:changed', (_event, library) => handler(library)),
  onOpenSettings: (handler) => ipcRenderer.on('settings:open', () => handler()),
  onFocusSearch: (handler) => ipcRenderer.on('search:focus', () => handler()),
});
