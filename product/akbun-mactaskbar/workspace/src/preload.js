'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listItems: () => ipcRenderer.invoke('menubar:list'),
  getState: () => ipcRenderer.invoke('sections:get'),
  cycleState: () => ipcRenderer.invoke('sections:cycle'),
  onState: (handler) => ipcRenderer.on('sections:state', (_event, state) => handler(state)),
});
