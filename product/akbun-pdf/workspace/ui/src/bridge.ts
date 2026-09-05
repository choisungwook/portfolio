import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { fixtureFor } from "./fixtures";
import { defaultAiSettings, normalizeAiSettings } from "./ai-settings";
import { previewPhase } from "./state";
import type {
  AnnotationDraft,
  AiConversation,
  AiConversationMeta,
  AiMessage,
  AiSettings,
  DocumentState,
  MergeFile,
  MergeReport,
  OpenDocumentPayload,
  OutlineItem,
  SaveResult,
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

export function isDesktopRuntime(): boolean {
  return isTauriRuntime();
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

export function saveDocument(documentId: string): Promise<SaveResult> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 저장해 주세요.");
  return invoke("save_document", { documentId });
}

export async function chooseAndSaveDocumentAs(
  documentId: string,
  title: string,
): Promise<SaveResult | null> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 저장해 주세요.");
  const path = await save({
    defaultPath: title,
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (!path) return null;
  return invoke("save_document_as", { documentId, path });
}

export function reorderPage(
  documentId: string,
  fromPage: number,
  toPage: number,
): Promise<DocumentState> {
  return invoke("reorder_page", { documentId, fromPage, toPage });
}

export function deletePage(documentId: string, page: number): Promise<DocumentState> {
  return invoke("delete_page", { documentId, page });
}

export function rotatePage(
  documentId: string,
  page: number,
  degrees: -90 | 90,
): Promise<DocumentState> {
  return invoke("rotate_page", { documentId, page, degrees });
}

export function upsertAnnotation(
  documentId: string,
  annotation: AnnotationDraft,
): Promise<DocumentState> {
  return invoke("upsert_annotation", { documentId, annotation });
}

export function deleteAnnotation(
  documentId: string,
  annotationId: string,
): Promise<DocumentState> {
  return invoke("delete_annotation", { documentId, annotationId });
}

export async function confirmDiscardChanges(): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  return ask("저장하지 않은 변경사항을 버릴까요?", {
    title: "변경사항이 저장되지 않음",
    kind: "warning",
  });
}

export function installCloseGuard(hasUnsavedChanges: () => boolean): void {
  if (!isTauriRuntime()) return;
  const window = getCurrentWindow();
  void window.onCloseRequested(async (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    if (await confirmDiscardChanges()) await window.destroy();
  });
}

export async function chooseAndAddMergeFiles(): Promise<MergeFile[]> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 합쳐 주세요.");
  const selected = await open({
    multiple: true,
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return invoke("add_merge_files", { paths });
}

export async function chooseAndSaveMergedDocument(
  fileIds: string[],
): Promise<MergeReport | null> {
  if (!isTauriRuntime()) throw new Error("Tauri 앱에서 PDF를 합쳐 주세요.");
  const path = await save({
    defaultPath: "merged.pdf",
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (!path) return null;
  return invoke("save_merged_document", { fileIds, path });
}

export function clearMergeFiles(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke("clear_merge_files");
}

export function aiStartServer(): Promise<{ version: string; running: boolean }> {
  if (!isTauriRuntime()) throw new Error("Codex 연결은 데스크톱 앱에서 사용할 수 있습니다.");
  return invoke("ai_start_server");
}

export function aiSendRpc(message: unknown): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Codex 연결은 데스크톱 앱에서 사용할 수 있습니다.");
  return invoke("ai_send_rpc", { message });
}

export function aiStopServer(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke("ai_stop_server");
}

export function aiRuntimeDirectory(): Promise<string> {
  if (!isTauriRuntime()) return Promise.resolve("");
  return invoke("ai_runtime_directory");
}

export function onAiServerMessage(handler: (message: unknown) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen("ai-server-message", (event) => handler(event.payload));
}

export function onAiServerState(handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen("ai-server-state", handler);
}

export async function aiLoadSettings(): Promise<AiSettings> {
  if (isTauriRuntime()) return invoke("ai_load_settings");
  try {
    const stored = localStorage.getItem("akbun-pdf.ai-settings");
    return stored ? normalizeAiSettings(JSON.parse(stored)) : defaultAiSettings();
  } catch {
    return defaultAiSettings();
  }
}

export async function aiSaveSettings(settings: AiSettings): Promise<AiSettings> {
  if (isTauriRuntime()) return invoke("ai_save_settings", { settings });
  const normalized = normalizeAiSettings(settings);
  localStorage.setItem("akbun-pdf.ai-settings", JSON.stringify(normalized));
  return normalized;
}

export async function aiListConversations(): Promise<AiConversationMeta[]> {
  if (isTauriRuntime()) return invoke("ai_list_conversations");
  return previewConversations().map((conversation) => conversation.meta);
}

export async function aiCreateConversation(
  id: string,
  title: string,
  createdAt: string,
): Promise<AiConversation> {
  if (isTauriRuntime()) return invoke("ai_create_conversation", { id, title, createdAt });
  const conversation: AiConversation = {
    meta: { id, title, createdAt, updatedAt: createdAt, messageCount: 0 },
    messages: [],
  };
  savePreviewConversation(conversation);
  return conversation;
}

export async function aiLoadConversation(id: string): Promise<AiConversation> {
  if (isTauriRuntime()) return invoke("ai_load_conversation", { id });
  const conversation = previewConversations().find((item) => item.meta.id === id);
  if (!conversation) throw new Error("저장한 대화를 찾을 수 없습니다.");
  return conversation;
}

export async function aiAppendMessage(
  conversationId: string,
  message: AiMessage,
): Promise<AiConversationMeta> {
  if (isTauriRuntime()) return invoke("ai_append_message", { conversationId, message });
  const conversation = await aiLoadConversation(conversationId);
  conversation.messages.push(message);
  conversation.meta.updatedAt = message.createdAt;
  conversation.meta.messageCount = conversation.messages.length;
  savePreviewConversation(conversation);
  return conversation.meta;
}

export async function aiRenameConversation(id: string, title: string): Promise<AiConversationMeta> {
  if (isTauriRuntime()) return invoke("ai_rename_conversation", { id, title });
  const conversation = await aiLoadConversation(id);
  conversation.meta.title = title.trim() || "새 대화";
  savePreviewConversation(conversation);
  return conversation.meta;
}

export async function aiDeleteConversation(id: string): Promise<void> {
  if (isTauriRuntime()) return invoke("ai_delete_conversation", { id });
  localStorage.removeItem(`akbun-pdf.ai-conversation.${id}`);
}

export function aiSavePageImage(
  requestId: string,
  page: number,
  dataUrl: string,
): Promise<string> {
  if (!isTauriRuntime()) throw new Error("페이지 요약은 데스크톱 앱에서 사용할 수 있습니다.");
  return invoke("ai_save_page_image", { requestId, page, dataUrl });
}

export function aiClearRequest(requestId: string): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke("ai_clear_request", { requestId });
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

function previewConversations(): AiConversation[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith("akbun-pdf.ai-conversation."))
    .flatMap((key) => {
      try {
        return [JSON.parse(localStorage.getItem(key) ?? "") as AiConversation];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.meta.updatedAt.localeCompare(left.meta.updatedAt));
}

function savePreviewConversation(conversation: AiConversation): void {
  localStorage.setItem(
    `akbun-pdf.ai-conversation.${conversation.meta.id}`,
    JSON.stringify(conversation),
  );
}
