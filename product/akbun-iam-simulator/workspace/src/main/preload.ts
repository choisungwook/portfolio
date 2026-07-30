import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  listProfiles: () => ipcRenderer.invoke("profiles:list"),
  runCommand: (command: string, profile: string) => ipcRenderer.invoke("aws:run", command, profile),
});
