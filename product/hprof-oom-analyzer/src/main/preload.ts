/** 렌더러에 노출하는 IPC 브리지. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  openFile: () => ipcRenderer.invoke("open-file"),
  analyze: (path: string) => ipcRenderer.invoke("analyze", path),
  pathToRoot: (objId: number) => ipcRenderer.invoke("path-to-root", objId),
  largestPath: (className: string) => ipcRenderer.invoke("largest-path", className),
});
