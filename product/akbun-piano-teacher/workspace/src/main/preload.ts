import { contextBridge, ipcRenderer } from 'electron'

const listen = (channel: string) => (listener: (value: unknown) => void) => {
  const handler = (_event: unknown, value: unknown) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  listSongs: () => ipcRenderer.invoke('library:list'),
  loadSong: (id: string) => ipcRenderer.invoke('library:load', id),
  importSong: () => ipcRenderer.invoke('library:import'),
  saveScore: (score: unknown, origins?: unknown) => ipcRenderer.invoke('library:save-score', score, origins),
  cancelTask: () => ipcRenderer.invoke('task:cancel'),
  onTaskProgress: listen('task:progress'),
  onTaskLog: listen('task:log'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  setApiKey: (key: string | null) => ipcRenderer.invoke('settings:set-api-key', key),
  visionStatus: () => ipcRenderer.invoke('vision:status'),
  openLibraryFolder: () => ipcRenderer.invoke('shell:open-library'),
})
