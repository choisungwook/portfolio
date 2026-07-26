/** 렌더러에 노출하는 IPC 브리지. */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listDocs: () => ipcRenderer.invoke("doc:list"),
  loadDoc: (name: string) => ipcRenderer.invoke("doc:load", name),
  saveDoc: (name: string, doc: unknown) => ipcRenderer.invoke("doc:save", name, doc),
  removeDoc: (name: string) => ipcRenderer.invoke("doc:remove", name),
  removeAllDocs: () => ipcRenderer.invoke("doc:remove-all"),
  importHtml: () => ipcRenderer.invoke("import:html"),
  importFolder: () => ipcRenderer.invoke("import:folder"),
  exportHtml: (html: string, defaultPath: string | null) =>
    ipcRenderer.invoke("export:html", html, defaultPath),
  appInfo: () => ipcRenderer.invoke("app:info"),
  onMenu: (handler: (name: string) => void) =>
    ipcRenderer.on("menu", (_event, name: string) => handler(name)),
});
