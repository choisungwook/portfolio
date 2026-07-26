import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface AppSettings {
  // kubectl 실행 명령. teleport 등 proxy를 쓰면 "tsh kubectl"처럼 설정한다.
  kubectlCommand: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  kubectlCommand: "kubectl",
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // 파일이 손상되어 kubectlCommand가 문자열이 아니면 기본값으로 폴백한다.
    const kubectlCommand =
      typeof parsed.kubectlCommand === "string" && parsed.kubectlCommand.trim()
        ? parsed.kubectlCommand
        : DEFAULT_SETTINGS.kubectlCommand;
    return { kubectlCommand };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    kubectlCommand: settings.kubectlCommand.trim() || DEFAULT_SETTINGS.kubectlCommand,
  };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}
