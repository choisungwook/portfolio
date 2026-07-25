/** Electron 메인 프로세스. 창 생성, 파일 선택 대화상자, 파일 읽기 IPC를 처리한다. */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Library } from "./library";

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

let library: Library;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 520,
    title: "shadowing-player",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../../static/index.html"));
}

function registerIpc(): void {
  ipcMain.handle("library:list", () => library.list());

  ipcMain.handle("library:add", async () => {
    const result = await dialog.showOpenDialog({
      title: "음성 파일 불러오기",
      filters: [{ name: "음성 파일", extensions: AUDIO_EXTENSIONS }],
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return library.list();
    return library.add(result.filePaths);
  });

  ipcMain.handle("library:remove", (_event, filePath: string) => library.remove(filePath));

  ipcMain.handle("library:set-duration", (_event, filePath: string, durationSec: number) => {
    library.setDuration(filePath, durationSec);
  });

  // 렌더러가 요청한 임의 경로를 그대로 읽지 않고, 대화상자로 추가된 목록의 경로만 허용한다.
  ipcMain.handle("audio:read", async (_event, filePath: string) => {
    if (!library.has(filePath)) {
      throw new Error("목록에 없는 파일은 읽을 수 없다");
    }
    return fs.readFile(filePath);
  });
}

app.whenReady().then(() => {
  library = new Library(app.getPath("userData"));
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
