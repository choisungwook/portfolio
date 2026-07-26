import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getNodes: () => ipcRenderer.invoke("kubectl:nodes"),
  getPods: (nodeName?: string) => ipcRenderer.invoke("kubectl:pods", nodeName),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
});
