import { invoke } from "@tauri-apps/api/core";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { fixtureFor } from "./fixtures";
import { previewPhase } from "./state";
import type { DocumentState } from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export async function getInitialState(): Promise<DocumentState> {
  const phase = previewPhase(window.location.search);
  if (phase) return fixtureFor(phase);
  if (!window.__TAURI_INTERNALS__) return fixtureFor("empty");
  return invoke<DocumentState>("get_document_state");
}

export async function checkForUpdates(): Promise<string> {
  if (!window.__TAURI_INTERNALS__) {
    return "브라우저 미리보기에서는 업데이트를 확인하지 않습니다.";
  }

  try {
    const update = await check();
    if (!update) {
      await message("최신 버전을 사용 중입니다.", { title: "akbun-pdf" });
      return "최신 버전입니다.";
    }

    const shouldInstall = await ask(
      `버전 ${update.version}을 내려받아 설치할까요?`,
      { title: "업데이트 있음", kind: "info" },
    );
    if (!shouldInstall) return "업데이트를 취소했습니다.";

    await update.downloadAndInstall();
    if (!navigator.userAgent.includes("Windows")) await relaunch();
    return "업데이트 설치를 시작했습니다.";
  } catch (error) {
    await message(`업데이트를 확인할 수 없습니다.\n\n${String(error)}`, {
      title: "업데이트 실패",
      kind: "error",
    });
    return "업데이트 확인에 실패했습니다.";
  }
}
