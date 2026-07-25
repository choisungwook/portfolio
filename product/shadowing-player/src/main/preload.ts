/** 렌더러에 노출하는 IPC 브리지. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  addFiles: () => ipcRenderer.invoke("library:add"),
  removeFile: (path: string) => ipcRenderer.invoke("library:remove", path),
  setDuration: (path: string, durationSec: number) =>
    ipcRenderer.invoke("library:set-duration", path, durationSec),
  readAudio: (path: string) => ipcRenderer.invoke("audio:read", path),
});
