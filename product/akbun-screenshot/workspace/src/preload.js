'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseDir: () => ipcRenderer.invoke('settings:choose-dir'),
  savePreview: () => ipcRenderer.invoke('preview:save'),
  deletePreview: () => ipcRenderer.invoke('preview:delete'),
});
