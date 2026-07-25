/** Electron 메인 프로세스. 창 생성, 상단 메뉴, 파일 선택 대화상자, 파일 읽기 IPC를 처리한다. */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Library } from "./library";
import { Logger } from "./logger";
import { checkUpdate, downloadDmg, spawnSwap } from "./update";

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

let library: Library;
let logger: Logger;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 520,
    title: "akbun-shadowing-player",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../../static/index.html"));
}

/** 디렉터리를 재귀 탐색해 지원하는 확장자의 파일 경로만 모은다. */
async function scanAudioFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => AUDIO_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase()))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

// ---------- 상단 메뉴 ----------

/** 열려 있는 창의 렌더러에 메뉴 선택을 알린다. */
function sendMenu(name: string): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send("menu", name);
}

/** 실행 중인 .app 번들 경로. exe는 <앱>.app/Contents/MacOS/<실행파일>이다. */
function appBundlePath(): string {
  return path.resolve(app.getPath("exe"), "../../..");
}

/** 내려받기와 교체가 진행되는 동안 메뉴를 다시 눌러도 겹쳐 돌지 않게 막는다. */
let updating = false;

/** dmg를 받아 교체 스크립트를 띄우고 앱을 끈다. 재실행은 스크립트가 한다. */
async function installUpdate(dmgUrl: string): Promise<void> {
  updating = true;
  try {
    logger.info("main", `업데이트 dmg 내려받기 시작: ${dmgUrl}`);
    const dmgPath = await downloadDmg(dmgUrl);
    logger.info("main", `내려받기 완료: ${dmgPath}. 앱을 교체하고 재실행한다`);
    await spawnSwap(appBundlePath(), dmgPath);
    app.quit();
  } catch (error) {
    updating = false;
    logger.error("main", `업데이트 설치 실패: ${String(error)}`);
    await dialog.showMessageBox({
      type: "error",
      message: "업데이트를 설치할 수 없다",
      detail: `${String(error)}\n\n릴리스 페이지에서 직접 내려받는다.`,
    });
  }
}

async function runUpdateCheck(): Promise<void> {
  if (updating) return;
  try {
    const result = await checkUpdate(app.getVersion());
    if (!result.hasUpdate) {
      await dialog.showMessageBox({
        type: "info",
        message: "최신 버전을 쓰고 있다",
        detail: `현재 버전 ${result.current}`,
      });
      return;
    }

    // 개발 모드(npm start)에서는 교체 대상이 Electron.app이라 설치를 막는다.
    const canInstall = app.isPackaged && result.dmgUrl !== null;
    const buttons = canInstall ? ["지금 업데이트", "릴리스 열기", "닫기"] : ["릴리스 열기", "닫기"];
    const detail = canInstall
      ? `현재 버전 ${result.current}. 지금 업데이트를 누르면 dmg를 받아 앱을 교체하고 다시 실행한다.`
      : `현재 버전 ${result.current}. 릴리스 페이지에서 dmg를 내려받는다.`;

    const answer = await dialog.showMessageBox({
      type: "info",
      message: `새 버전 ${result.latest}이 있다`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
    });

    if (canInstall && answer.response === 0) {
      await installUpdate(result.dmgUrl!);
      return;
    }
    const openIndex = canInstall ? 1 : 0;
    if (answer.response === openIndex && result.url) await shell.openExternal(result.url);
  } catch (error) {
    logger.error("main", `업데이트 확인 실패: ${String(error)}`);
    await dialog.showMessageBox({
      type: "error",
      message: "업데이트를 확인할 수 없다",
      detail: String(error),
    });
  }
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "업데이트 확인…", click: () => void runUpdateCheck() },
        { type: "separator" },
        { role: "hide" },
        { role: "quit" },
      ],
    },
    {
      label: "Settings",
      submenu: [
        { label: "설정 열기", accelerator: "CmdOrCtrl+,", click: () => sendMenu("settings") },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------

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

  ipcMain.handle("library:add-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "폴더 불러오기",
      properties: ["openDirectory"],
    });
    if (result.canceled) return library.list();
    const files = (await Promise.all(result.filePaths.map(scanAudioFiles))).flat();
    logger.info("main", `폴더에서 음성 파일 ${files.length}개 발견`);
    return library.add(files);
  });

  ipcMain.handle("library:remove", (_event, filePath: string) => library.remove(filePath));

  ipcMain.handle("library:set-duration", (_event, filePath: string, durationSec: number) => {
    library.setDuration(filePath, durationSec);
  });

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    libraryPath: library.storePath,
    logPath: logger.logFilePath,
  }));

  ipcMain.handle("app:reveal", (_event, target: string) => shell.showItemInFolder(target));

  // 렌더러가 요청한 임의 경로를 그대로 읽지 않고, 대화상자로 추가된 목록의 경로만 허용한다.
  ipcMain.handle("audio:read", async (_event, filePath: string) => {
    if (!library.has(filePath)) {
      logger.error("main", `목록에 없는 파일 읽기 거부: ${filePath}`);
      throw new Error("목록에 없는 파일은 읽을 수 없다");
    }
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      logger.error("main", `파일 읽기 실패: ${filePath}: ${String(error)}`);
      throw error;
    }
  });

  // 렌더러의 오류를 로그 파일에 남긴다. 응답이 필요 없으므로 send/on을 쓴다.
  ipcMain.on("log:error", (_event, source: string, message: string) => {
    logger.error(source, message);
  });
}

app.whenReady().then(() => {
  logger = new Logger(app.getPath("logs"));
  logger.info("main", `앱 시작 v${app.getVersion()}`);
  process.on("uncaughtException", (error) => {
    logger.error("main", `uncaughtException: ${error.stack ?? String(error)}`);
  });

  library = new Library(app.getPath("userData"));
  registerIpc();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
