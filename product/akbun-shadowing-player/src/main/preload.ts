/** 렌더러에 노출하는 IPC 브리지. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  addFiles: () => ipcRenderer.invoke("library:add"),
  addFolder: () => ipcRenderer.invoke("library:add-folder"),
  removeFile: (path: string) => ipcRenderer.invoke("library:remove", path),
  refreshLibrary: () => ipcRenderer.invoke("library:refresh"),
  setDuration: (path: string, durationSec: number) =>
    ipcRenderer.invoke("library:set-duration", path, durationSec),
  readAudio: (path: string) => ipcRenderer.invoke("audio:read", path),
  appInfo: () => ipcRenderer.invoke("app:info"),
  reveal: (path: string) => ipcRenderer.invoke("app:reveal", path),
  onMenu: (handler: (name: string) => void) =>
    ipcRenderer.on("menu", (_event, name: string) => handler(name)),
  logError: (source: string, message: string) => ipcRenderer.send("log:error", source, message),
});
