/** Electron 메인 프로세스. 창 생성과 파일 열기/분석 IPC를 처리한다. */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as path from "node:path";
import * as analyzer from "../core/analyzer";
import { HeapObject, HeapSnapshot } from "../core/model";
import { parseHprof } from "../core/parser";

let snapshot: HeapSnapshot | null = null;
let referrers: analyzer.Referrers = new Map();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.loadFile(path.join(__dirname, "../../static/index.html"));
}

function toLargeDto(obj: HeapObject) {
  return { objId: obj.objId, className: obj.className, shallowSize: obj.shallowSize };
}

function registerIpc(): void {
  ipcMain.handle("open-file", async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: "hprof", extensions: ["hprof"] }, { name: "모든 파일", extensions: ["*"] }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("analyze", (_event, filePath: string) => {
    snapshot = parseHprof(filePath);
    const stats = analyzer.classHistogram(snapshot);
    analyzer.computeRetained(snapshot, stats);
    referrers = analyzer.buildReferrers(snapshot);
    return {
      stats,
      large: analyzer.findLargeObjects(snapshot).map(toLargeDto),
      threads: snapshot.threads.map((t) => ({ serial: t.serial, name: t.name, frames: t.frames })),
      objectCount: snapshot.objects.size,
      rootCount: snapshot.roots.length,
    };
  });

  ipcMain.handle("path-to-root", (_event, objId: number) => {
    if (!snapshot) return null;
    const target = snapshot.objects.get(objId);
    if (!target) return null;
    return { target: toLargeDto(target), steps: analyzer.pathToGcRoot(snapshot, referrers, objId) };
  });

  ipcMain.handle("largest-path", (_event, className: string) => {
    if (!snapshot) return null;
    const target = analyzer.largestInstanceOf(snapshot, className);
    if (!target) return null;
    return {
      target: toLargeDto(target),
      steps: analyzer.pathToGcRoot(snapshot, referrers, target.objId),
    };
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
