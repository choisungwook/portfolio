import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface AppSettings {
  // kubectl 실행 명령. teleport 등 proxy를 쓰면 "tsh kubectl"처럼 설정한다.
  kubectlCommand: string;
  // karpenter가 설치된 namespace. event와 pod log를 이 namespace에서 조회한다.
  karpenterNamespace: string;
  // karpenter pod를 찾는 label selector. kubectl -l 값과 같은 형식이다.
  karpenterPodLabelSelector: string;
  // pod log를 몇 분 전까지 볼지. kubectl logs --since 값으로 쓴다.
  karpenterLogSinceMinutes: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  kubectlCommand: "kubectl",
  karpenterNamespace: "karpenter",
  karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
  karpenterLogSinceMinutes: 15,
};

const MIN_LOG_SINCE_MINUTES = 1;
const MAX_LOG_SINCE_MINUTES = 1440;

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/** 문자열이 아니거나 비어 있으면 기본값으로 폴백한다. */
function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** 숫자가 아니거나 범위를 벗어나면 허용 범위 안으로 맞춘다. */
function normalizeSinceMinutes(value: unknown): number {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes)) return DEFAULT_SETTINGS.karpenterLogSinceMinutes;
  if (minutes < MIN_LOG_SINCE_MINUTES) return MIN_LOG_SINCE_MINUTES;
  if (minutes > MAX_LOG_SINCE_MINUTES) return MAX_LOG_SINCE_MINUTES;
  return minutes;
}

/** 손상되었거나 예전 버전이라 필드가 없는 설정을 기본값으로 채운다. */
function normalize(parsed: Partial<AppSettings>): AppSettings {
  return {
    kubectlCommand: normalizeText(parsed.kubectlCommand, DEFAULT_SETTINGS.kubectlCommand),
    karpenterNamespace: normalizeText(
      parsed.karpenterNamespace,
      DEFAULT_SETTINGS.karpenterNamespace
    ),
    karpenterPodLabelSelector: normalizeText(
      parsed.karpenterPodLabelSelector,
      DEFAULT_SETTINGS.karpenterPodLabelSelector
    ),
    karpenterLogSinceMinutes: normalizeSinceMinutes(parsed.karpenterLogSinceMinutes),
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    return normalize(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const merged = normalize(settings);
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}
