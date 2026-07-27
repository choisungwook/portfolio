import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getNodes: () => ipcRenderer.invoke("kubectl:nodes"),
  getPods: (nodeName?: string) => ipcRenderer.invoke("kubectl:pods", nodeName),
  getKarpenterEvents: () => ipcRenderer.invoke("kubectl:karpenter-events"),
  getKarpenterLogs: () => ipcRenderer.invoke("kubectl:karpenter-logs"),
  getKarpenterResources: () => ipcRenderer.invoke("kubectl:karpenter-resources"),
  getKarpenterVersions: () => ipcRenderer.invoke("kubectl:karpenter-versions"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
});
