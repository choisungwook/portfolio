import { invoke } from "@tauri-apps/api/core";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { fixtureFor } from "./fixtures";
import { previewPhase } from "./state";
import type {
  DocumentState,
  OpenDocumentPayload,
  OutlineItem,
  PreservationReport,
} from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauriRuntime(): boolean {
  const internals = window.__TAURI_INTERNALS__;
  if (typeof internals !== "object" || internals === null) return false;
  const metadata = (internals as { metadata?: { currentWindow?: { label?: unknown } } }).metadata;
  return typeof metadata?.currentWindow?.label === "string";
}

export async function getInitialState(): Promise<DocumentState> {
  const phase = previewPhase(window.location.search);
  if (phase) return fixtureFor(phase);
  if (!isTauriRuntime()) return fixtureFor("empty");
  return invoke<DocumentState>("get_document_state");
}

export async function chooseAndOpenDocument(): Promise<OpenDocumentPayload | null> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 열어주세요.");
  const path = await open({
    multiple: false,
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (!path) return null;
  return invoke<OpenDocumentPayload>("open_document", { path });
}

export function completeDocumentOpen(
  documentId: string,
  pageCount: number,
  outline: OutlineItem[],
): Promise<DocumentState> {
  return invoke("complete_document_open", { documentId, pageCount, outline });
}

export function failDocumentOpen(documentId: string, error: unknown): Promise<DocumentState> {
  return invoke("fail_document_open", { documentId, message: String(error) });
}

export function closeDocument(): Promise<DocumentState> {
  if (!isTauriRuntime()) return Promise.resolve(fixtureFor("empty"));
  return invoke("close_document");
}

export async function chooseAndSaveDocument(
  documentId: string,
  title: string,
): Promise<PreservationReport | null> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 저장해 주세요.");
  const path = await save({
    defaultPath: title,
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (!path) return null;
  return invoke("save_document", { documentId, path });
}

export async function checkForUpdates(): Promise<string> {
  if (!isTauriRuntime()) {
    return "브라우저 미리보기에서는 업데이트를 확인하지 않습니다.";
  }

  try {
    const update = await check();
    if (!update) {
      await message("최신 버전을 사용 중입니다.", { title: "akbun-pdf" });
      return "최신 버전입니다.";
    }

    const shouldInstall = await ask(`버전 ${update.version}을 내려받아 설치할까요?`, {
      title: "업데이트 있음",
      kind: "info",
    });
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
