/** Electron 메인 프로세스. 창 생성, 상단 메뉴, 파일 대화상자, 문서 저장 IPC를 처리한다. */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DocStore } from "./store";
import { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } from "./update";

let store: DocStore;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: "akbun-PPTEditorFromHTML",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../../static/index.html"));
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

/**
 * dmg를 받아 교체 스크립트를 띄우고 앱을 끈다. 재실행은 스크립트가 한다.
 * 스크립트를 띄우기 전에 실패하면 받아 둔 dmg를 지운다. 스크립트가 뜬 뒤에는
 * 스크립트의 trap이 정리를 맡는다.
 */
async function installUpdate(dmgUrl: string): Promise<void> {
  updating = true;
  let dmgPath: string | null = null;
  try {
    dmgPath = await downloadDmg(dmgUrl);
    await spawnSwap(appBundlePath(), dmgPath);
    app.quit();
  } catch (error) {
    updating = false;
    if (dmgPath) {
      await fs.rm(path.dirname(dmgPath), { recursive: true, force: true }).catch(() => {});
    }
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
      label: "File",
      submenu: [
        { label: "학습지 HTML 임포트…", accelerator: "CmdOrCtrl+O", click: () => sendMenu("import") },
        { label: "학습지 HTML로 내보내기…", accelerator: "CmdOrCtrl+E", click: () => sendMenu("export") },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------

const HTML_EXTENSIONS = ["html", "htm"];

/** 디렉터리를 재귀 탐색해 HTML 파일 경로만 모은다. */
async function scanHtmlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => HTML_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase()))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

async function readHtmlFiles(paths: string[]): Promise<{ path: string; html: string }[]> {
  return Promise.all(
    paths.map(async (filePath) => ({ path: filePath, html: await fs.readFile(filePath, "utf-8") })),
  );
}

function registerIpc(): void {
  ipcMain.handle("doc:list", () => store.list());
  ipcMain.handle("doc:load", (_event, name: string) => store.load(name));
  ipcMain.handle("doc:save", (_event, name: string, doc: unknown) => store.save(name, doc));
  ipcMain.handle("doc:remove", (_event, name: string) => store.remove(name));
  ipcMain.handle("doc:remove-all", () => store.removeAll());

  // 학습지 HTML을 골라 원문과 경로를 돌려준다. 취소하면 빈 배열.
  ipcMain.handle("import:html", async () => {
    const result = await dialog.showOpenDialog({
      title: "학습지 HTML 불러오기",
      filters: [{ name: "HTML", extensions: HTML_EXTENSIONS }],
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    return readHtmlFiles(result.filePaths);
  });

  // 폴더를 골라 그 안의 HTML 파일 전부를 원문과 함께 돌려준다. 취소하면 빈 배열.
  // 학습지 형식인지는 renderer의 importer가 판별한다.
  ipcMain.handle("import:folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "폴더 불러오기",
      properties: ["openDirectory"],
    });
    if (result.canceled) return [];
    const files = (
      await Promise.all(result.filePaths.map((folder) => scanHtmlFiles(folder)))
    ).flat();
    return readHtmlFiles(files);
  });

  // export 대상 경로는 사용자가 대화상자로 고른다. 기본값은 임포트했던 원본 경로다.
  ipcMain.handle("export:html", async (_event, html: string, defaultPath: string | null) => {
    const result = await dialog.showSaveDialog({
      title: "학습지 HTML로 내보내기",
      defaultPath: defaultPath ?? undefined,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, html, "utf-8");
    return result.filePath;
  });

  ipcMain.handle("app:info", () => ({ version: app.getVersion(), storePath: store.dir }));
}

app.whenReady().then(() => {
  // 이전 업데이트 시도가 끊겨 /tmp에 남은 dmg를 지운다.
  void cleanupTempDirs().catch((error) => {
    console.error(`임시 디렉터리 정리 실패: ${String(error)}`);
  });

  store = new DocStore(app.getPath("documents"));
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
