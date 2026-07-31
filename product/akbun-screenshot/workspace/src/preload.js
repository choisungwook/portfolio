'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseDir: () => ipcRenderer.invoke('settings:choose-dir'),
  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  openScreenPermissionSettings: () => ipcRenderer.invoke('permissions:open-screen-settings'),
  savePreview: () => ipcRenderer.invoke('preview:save'),
  copyPreview: () => ipcRenderer.invoke('preview:copy'),
  closePreview: () => ipcRenderer.invoke('preview:close'),
});
