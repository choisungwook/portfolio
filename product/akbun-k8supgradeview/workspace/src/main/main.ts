import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import * as fs from "node:fs/promises";
import * as path from "path";
import {
  getKarpenterEvents,
  getKarpenterLogs,
  getKarpenterResources,
  getKarpenterVersions,
  getNodes,
  getPods,
  setNodeCordon,
} from "./kubectl";
import { AppSettings, loadSettings, saveSettings } from "./settings";
import { checkUpdate, cleanupTempDirs, downloadDmg, spawnSwap } from "./update";

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

/**
 * 노드 이름을 kubectl 인자로 넘기기 전에 검증한다. shell을 거치지 않아 인젝션은 없지만
 * -로 시작하는 값은 kubectl이 옵션으로 읽으므로 막는다.
 */
function assertNodeName(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("노드 이름이 잘못되었다: 비어 있지 않은 문자열이어야 한다");
  }
  if (value.startsWith("-")) {
    throw new Error("노드 이름이 잘못되었다: -로 시작할 수 없다");
  }
}

/** 클러스터를 바꾸는 동작이므로 실행 전에 한 번 묻는다. */
async function confirmCordon(nodeName: string, cordon: boolean): Promise<boolean> {
  const action = cordon ? "cordon" : "uncordon";
  const detail = cordon
    ? "이 노드에 새 파드가 스케줄되지 않는다. 이미 떠 있는 파드는 그대로 남는다."
    : "이 노드에 다시 파드가 스케줄된다.";
  const answer = await dialog.showMessageBox({
    type: "question",
    message: `${nodeName}을 ${action}한다`,
    detail,
    buttons: [action, "취소"],
    defaultId: 0,
    cancelId: 1,
  });
  return answer.response === 0;
}

function registerIpcHandlers(): void {
  ipcMain.handle("kubectl:nodes", () => getNodes());
  // 취소를 눌렀는지 renderer가 알아야 새로고침 여부를 정할 수 있어 boolean을 돌려준다.
  ipcMain.handle("kubectl:set-node-cordon", async (_event, nodeName: unknown, cordon: unknown) => {
    assertNodeName(nodeName);
    if (typeof cordon !== "boolean") {
      throw new Error("cordon 값이 잘못되었다: boolean이어야 한다");
    }
    if (!(await confirmCordon(nodeName, cordon))) return false;
    await setNodeCordon(nodeName, cordon);
    return true;
  });
  ipcMain.handle("kubectl:pods", (_event, nodeName?: string) => getPods(nodeName));
  ipcMain.handle("kubectl:karpenter-events", () => getKarpenterEvents());
  ipcMain.handle("kubectl:karpenter-logs", () => getKarpenterLogs());
  ipcMain.handle("kubectl:karpenter-resources", () => getKarpenterResources());
  ipcMain.handle("kubectl:karpenter-versions", () => getKarpenterVersions());
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", (_event, settings: unknown) => {
    // IPC 경계에서 형식을 검증한다. renderer가 잘못된 값을 보내면 명확한 에러로 알린다.
    const input = settings as Partial<AppSettings> | null;
    if (typeof input?.kubectlCommand !== "string") {
      throw new Error("settings 형식이 잘못되었다: kubectlCommand는 문자열이어야 한다");
    }
    if (typeof input.karpenterNamespace !== "string") {
      throw new Error("settings 형식이 잘못되었다: karpenterNamespace는 문자열이어야 한다");
    }
    if (typeof input.karpenterPodLabelSelector !== "string") {
      throw new Error("settings 형식이 잘못되었다: karpenterPodLabelSelector는 문자열이어야 한다");
    }
    if (typeof input.karpenterLogSinceMinutes !== "number") {
      throw new Error("settings 형식이 잘못되었다: karpenterLogSinceMinutes는 숫자여야 한다");
    }
    return saveSettings(input);
  });
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
    if (dmgPath) await fs.rm(path.dirname(dmgPath), { recursive: true, force: true });
    updating = false;
    await dialog.showMessageBox({
      type: "error",
      message: "업데이트 설치에 실패했다",
      detail: String(error),
    });
  }
}

/** 메뉴에서 업데이트 확인을 눌렀을 때의 흐름. GitHub Release의 최신 버전과 비교한다. */
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
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // 강제 종료로 남은 업데이트 임시 디렉터리를 지운다. 실패해도 앱 동작에는 지장 없다.
  void cleanupTempDirs().catch(() => {});
  registerIpcHandlers();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
