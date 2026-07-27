import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  getNodes: () => ipcRenderer.invoke("kubectl:nodes"),
  getPods: (nodeName?: string) => ipcRenderer.invoke("kubectl:pods", nodeName),
  describePod: (namespace: string, name: string) =>
    ipcRenderer.invoke("kubectl:describe-pod", namespace, name),
  getNamespaces: () => ipcRenderer.invoke("kubectl:namespaces"),
  buildOverprovisionYaml: (options: unknown) => ipcRenderer.invoke("overprovision:build", options),
  setNodeCordon: (nodeName: string, cordon: boolean) =>
    ipcRenderer.invoke("kubectl:set-node-cordon", nodeName, cordon),
  getKarpenterEvents: () => ipcRenderer.invoke("kubectl:karpenter-events"),
  getKarpenterLogs: () => ipcRenderer.invoke("kubectl:karpenter-logs"),
  getKarpenterResources: () => ipcRenderer.invoke("kubectl:karpenter-resources"),
  getKarpenterVersions: () => ipcRenderer.invoke("kubectl:karpenter-versions"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
});
