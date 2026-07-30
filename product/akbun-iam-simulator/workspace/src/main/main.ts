import { app, BrowserWindow, Menu, nativeTheme } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { ipcMain } from "electron";
import * as path from "path";
import { loadProfiles } from "./profiles";
import { assertAwsCommand, runAwsCommand } from "./runner";

function createWindow(): void {
  // 렌더러의 테마 배경과 맞춰 기동 시 흰 화면 깜빡임을 막는다.
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#14171c" : "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function registerIpcHandlers(): void {
  ipcMain.handle("profiles:list", () => loadProfiles());
  // IPC 경계에서 형식을 검증한다. renderer가 잘못된 값을 보내면 명확한 에러로 알린다.
  ipcMain.handle("aws:run", (_event, command: unknown, profile: unknown) => {
    assertAwsCommand(command);
    if (typeof profile !== "string" || profile.trim() === "") {
      throw new Error("profile을 먼저 고른다");
    }
    return runAwsCommand(command, profile);
  });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
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
