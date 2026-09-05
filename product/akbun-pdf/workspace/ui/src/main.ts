import "./styles.css";
import "./viewer.css";
import "./editor.css";
import {
  checkForUpdates,
  chooseAndOpenDocument,
  chooseAndAddMergeFiles,
  chooseAndSaveDocumentAs,
  chooseAndSaveMergedDocument,
  clearMergeFiles,
  closeDocument,
  completeDocumentOpen,
  confirmDiscardChanges,
  deleteAnnotation,
  deletePage,
  failDocumentOpen,
  getInitialState,
  installCloseGuard,
  reorderPage,
  rotatePage,
  saveDocument,
  upsertAnnotation,
} from "./bridge";
import { configurePdfEngine, PdfDocumentAdapter } from "./pdf-engine";
import { renderDocument, showToast } from "./render";
import { changeZoom, goToPage, normalizeState } from "./state";
import type {
  AnnotationDraft,
  AnnotationKind,
  DocumentState,
  FitMode,
  MergeFile,
  SaveResult,
  SearchResult,
} from "./types";
import { PdfViewer } from "./viewer";

function element<T extends Element>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`missing element: ${selector}`);
  return match;
}

configurePdfEngine();

let state: DocumentState = normalizeState(await getInitialState());
let searchResults: SearchResult[] = [];
let selectedResult = -1;
let annotationDraft: AnnotationDraft | null = null;
let mergeFiles: MergeFile[] = [];
let draggedPage = 0;
let draggedMergeId = "";

const searchPanel = element<HTMLElement>("[data-role='search-panel']");
const searchInput = element<HTMLInputElement>("[data-role='search-input']");
const searchStatus = element<HTMLElement>("[data-role='search-status']");
const annotationDialog = element<HTMLDialogElement>("[data-role='annotation-dialog']");
const mergeDialog = element<HTMLDialogElement>("[data-role='merge-dialog']");
const viewer = new PdfViewer(
  element(".document-stage"),
  element(".viewer"),
  {
    onCurrentPage: (page) => updateState(goToPage(state, page)),
    onIndexProgress: () => refreshSearchResults(),
    onCreateAnnotation: (kind, page, rect) => {
      openAnnotationEditor({
        id: null,
        page,
        kind,
        rect,
        color: kind === "highlight" ? "#ffd54f" : "#ffb74d",
        contents: "",
      });
    },
    onEditAnnotation: (annotationId) => {
      const annotation = state.annotations.find((item) => item.id === annotationId);
      if (annotation) openAnnotationEditor({ ...annotation });
    },
  },
);

renderDocument(state);
installCloseGuard(() => state.dirty);
restorePanelSizes();
wirePanelResizers();
wireThumbnailDragging();
wireMergeDragging();

function updateState(next: DocumentState): void {
  state = normalizeState(next);
  renderDocument(state);
}

async function applyEditedState(next: DocumentState): Promise<void> {
  updateState(next);
  await viewer.updateDocument(state.thumbnails, state.annotations);
  viewer.goTo(state.currentPage);
  if (!searchPanel.hidden) refreshSearchResults();
}

async function openDocument(): Promise<void> {
  let adapter: PdfDocumentAdapter | null = null;
  try {
    if (state.dirty && !await confirmDiscardChanges()) return;
    const opened = await chooseAndOpenDocument();
    if (!opened) return;
    await viewer.close();
    updateState(opened.state);
    const documentId = opened.state.documentId;
    if (!documentId) throw new Error("문서 식별자가 없습니다.");
    adapter = await PdfDocumentAdapter.open(opened.bytes);
    const outline = await adapter.outline();
    const ready = await completeDocumentOpen(documentId, adapter.pageCount, outline);
    updateState(ready);
    const viewerAdapter = adapter;
    adapter = null;
    await viewer.open(viewerAdapter, ready.thumbnails, ready.annotations);
    refreshSearchResults();
  } catch (error) {
    if (adapter) await adapter.destroy();
    if (state.phase === "loading" && state.documentId) {
      await viewer.close();
      try {
        updateState(await failDocumentOpen(state.documentId, error));
      } catch {
        updateState({ ...state, phase: "error", errorMessage: String(error) });
      }
    } else {
      showToast(`열기 실패 · ${String(error)}`);
    }
  }
}

async function closeCurrentDocument(): Promise<void> {
  if (state.dirty && !await confirmDiscardChanges()) return;
  await viewer.close();
  updateState(await closeDocument());
  closeFind();
}

async function saveCurrentDocument(saveAs = false): Promise<void> {
  if (!state.documentId) return;
  let result: SaveResult | null;
  try {
    result = saveAs
      ? await chooseAndSaveDocumentAs(state.documentId, state.title)
      : await saveDocument(state.documentId);
    if (!result) return;
  } catch (error) {
    showToast(`저장 실패 · ${String(error)}`);
    return;
  }
  updateState(result.state);
  try {
    await reopenSavedDocument(result);
  } catch {
    await viewer.close();
    showToast("저장은 완료됐지만 화면을 다시 불러오지 못했습니다.");
    return;
  }
  const size = new Intl.NumberFormat("ko-KR").format(result.report.savedSize);
  const preserved = result.report.contentStreamsPreserved && result.report.objectStreamsPreserved
    ? "원본 스트림 보존"
    : "스트림 확인 필요";
  showToast(`저장 완료 · ${preserved} · ${size} bytes`);
}

async function reopenSavedDocument(result: SaveResult): Promise<void> {
  const documentId = result.state.documentId;
  if (!documentId) return;
  const adapter = await PdfDocumentAdapter.open(result.bytes);
  try {
    const outline = await adapter.outline();
    const ready = await completeDocumentOpen(documentId, adapter.pageCount, outline);
    updateState(ready);
    await viewer.open(adapter, ready.thumbnails, ready.annotations);
  } catch (error) {
    await adapter.destroy();
    throw error;
  }
}

async function editPage(action: Promise<DocumentState>): Promise<void> {
  try {
    await applyEditedState(await action);
  } catch (error) {
    showToast(String(error));
  }
}

function applyZoom(mode: FitMode, requested = state.zoom): void {
  const zoom = viewer.zoom(mode, requested);
  updateState({ ...state, zoom });
  if (!searchPanel.hidden) refreshSearchResults();
}

function toggleAnnotationTool(kind: AnnotationKind): void {
  const button = element<HTMLButtonElement>(`[data-action='${kind}']`);
  const active = !button.classList.contains("tool-button--active");
  document.querySelectorAll(".tool-button--active").forEach((item) => item.classList.remove("tool-button--active"));
  button.classList.toggle("tool-button--active", active);
  viewer.setTool(active ? kind : null);
  if (active) showToast(kind === "highlight" ? "텍스트를 드래그해 선택하세요." : "페이지에서 메모 위치를 클릭하세요.");
}

function openAnnotationEditor(draft: AnnotationDraft): void {
  annotationDraft = { ...draft, rect: { ...draft.rect } };
  element<HTMLElement>("[data-role='annotation-title']").textContent =
    draft.kind === "highlight" ? "형광펜 주석" : "메모 주석";
  element<HTMLInputElement>("[data-role='annotation-color']").value = draft.color;
  element<HTMLTextAreaElement>("[data-role='annotation-contents']").value = draft.contents;
  element<HTMLButtonElement>("[data-action='delete-annotation']").hidden = draft.id === null;
  annotationDialog.showModal();
  if (draft.kind === "note") {
    element<HTMLTextAreaElement>("[data-role='annotation-contents']").focus();
  }
}

async function submitAnnotation(): Promise<void> {
  if (!annotationDraft || !state.documentId) return;
  const draft = {
    ...annotationDraft,
    color: element<HTMLInputElement>("[data-role='annotation-color']").value,
    contents: element<HTMLTextAreaElement>("[data-role='annotation-contents']").value,
  };
  annotationDialog.close();
  annotationDraft = null;
  await editPage(upsertAnnotation(state.documentId, draft));
}

async function removeAnnotation(): Promise<void> {
  if (!annotationDraft?.id || !state.documentId) return;
  const id = annotationDraft.id;
  annotationDialog.close();
  annotationDraft = null;
  await editPage(deleteAnnotation(state.documentId, id));
}

function openFind(): void {
  if (state.phase !== "ready") return;
  searchPanel.hidden = false;
  searchInput.focus();
  searchInput.select();
  refreshSearchResults();
}

function closeFind(): void {
  searchPanel.hidden = true;
  searchResults = [];
  selectedResult = -1;
  viewer.showSearchResults([], -1);
}

function refreshSearchResults(): void {
  const selectedId = searchResults[selectedResult]?.id;
  searchResults = viewer.search.query(searchInput.value);
  selectedResult = selectedId ? searchResults.findIndex((result) => result.id === selectedId) : -1;
  if (selectedResult < 0 && searchResults.length > 0) selectedResult = 0;
  const progress = viewer.search.progress();
  const position = selectedResult < 0 ? "0" : String(selectedResult + 1);
  searchStatus.textContent = searchInput.value.trim()
    ? `${position} / ${searchResults.length} · ${progress.indexed}/${progress.total} 페이지`
    : `${progress.indexed}/${progress.total} 페이지 준비됨`;
  viewer.showSearchResults(searchResults, selectedResult);
}

function moveSearchResult(delta: number): void {
  if (searchResults.length === 0) return;
  selectedResult = (selectedResult + delta + searchResults.length) % searchResults.length;
  viewer.showSearchResults(searchResults, selectedResult);
  const result = searchResults[selectedResult];
  if (result) viewer.goTo(result.page);
  const progress = viewer.search.progress();
  searchStatus.textContent = `${selectedResult + 1} / ${searchResults.length} · ${progress.indexed}/${progress.total} 페이지`;
}

function navigateTo(page: number, top: number | null = null): void {
  const next = goToPage(state, page);
  updateState(next);
  viewer.goTo(next.currentPage, top);
}

function openMerge(): void {
  mergeFiles = [];
  renderMergeFiles();
  mergeDialog.showModal();
}

async function addFilesToMerge(): Promise<void> {
  try {
    mergeFiles.push(...await chooseAndAddMergeFiles());
    renderMergeFiles();
  } catch (error) {
    showToast(`파일 추가 실패 · ${String(error)}`);
  }
}

async function saveMerge(): Promise<void> {
  const valid = mergeFiles.filter((file) => !file.errorMessage);
  if (valid.length < 2) {
    showToast("읽을 수 있는 PDF를 두 개 이상 추가해 주세요.");
    return;
  }
  try {
    const report = await chooseAndSaveMergedDocument(valid.map((file) => file.id));
    if (!report) return;
    showToast(`PDF 합치기 완료 · ${report.pageCount}페이지`);
    await closeMerge();
  } catch (error) {
    showToast(`PDF 합치기 실패 · ${String(error)}`);
  }
}

async function closeMerge(): Promise<void> {
  mergeDialog.close();
  mergeFiles = [];
  await clearMergeFiles();
}

function renderMergeFiles(): void {
  const list = element<HTMLElement>("[data-role='merge-list']");
  list.replaceChildren(...mergeFiles.map((file) => {
    const item = document.createElement("div");
    item.className = `merge-file${file.errorMessage ? " merge-file--error" : ""}`;
    item.draggable = !file.errorMessage;
    item.dataset.mergeId = file.id;
    const handle = document.createElement("span");
    handle.className = "merge-file__handle";
    handle.textContent = "☰";
    const name = document.createElement("span");
    name.className = "merge-file__name";
    name.textContent = file.title;
    const meta = document.createElement("span");
    meta.className = "merge-file__meta";
    meta.textContent = file.errorMessage ? "읽기 실패" : `${file.pageCount}페이지`;
    const remove = document.createElement("button");
    remove.className = "mini-button";
    remove.type = "button";
    remove.dataset.removeMerge = file.id;
    remove.ariaLabel = "목록에서 제거";
    remove.textContent = "×";
    item.append(handle, name, meta, remove);
    if (file.errorMessage) {
      const error = document.createElement("span");
      error.className = "merge-file__error";
      error.textContent = file.errorMessage;
      item.append(error);
    }
    return item;
  }));
  const valid = mergeFiles.filter((file) => !file.errorMessage);
  const pages = valid.reduce((total, file) => total + file.pageCount, 0);
  element<HTMLElement>("[data-role='merge-summary']").textContent =
    `${valid.length}개 파일 · ${pages}페이지`;
}

function handleAction(action: string): void {
  if (action === "open") void openDocument();
  if (action === "merge") openMerge();
  if (action === "close") void closeCurrentDocument();
  if (action === "save") void saveCurrentDocument();
  if (action === "previous-page") navigateTo(state.currentPage - 1);
  if (action === "next-page") navigateTo(state.currentPage + 1);
  if (action === "zoom-in") applyZoom("custom", changeZoom(state, 0.1).zoom);
  if (action === "zoom-out") applyZoom("custom", changeZoom(state, -0.1).zoom);
  if (action === "reset-zoom" || action === "actual-size") applyZoom("actual");
  if (action === "fit-width") applyZoom("width");
  if (action === "fit-page") applyZoom("page");
  if (action === "find") openFind();
  if (action === "close-find") closeFind();
  if (action === "previous-result") moveSearchResult(-1);
  if (action === "next-result") moveSearchResult(1);
  if (action === "highlight" || action === "note") toggleAnnotationTool(action);
  if (action === "rotate-left" && state.documentId) void editPage(rotatePage(state.documentId, state.currentPage, -90));
  if (action === "rotate-right" && state.documentId) void editPage(rotatePage(state.documentId, state.currentPage, 90));
  if (action === "delete-page" && state.documentId && window.confirm(`${state.currentPage}페이지를 삭제할까요?`)) {
    void editPage(deletePage(state.documentId, state.currentPage));
  }
  if (action === "close-annotation") annotationDialog.close();
  if (action === "delete-annotation") void removeAnnotation();
  if (action === "add-merge-files") void addFilesToMerge();
  if (action === "save-merge") void saveMerge();
  if (action === "close-merge") void closeMerge();
  if (action === "toggle-pages") document.body.classList.toggle("pages-collapsed");
  if (action === "toggle-outline") document.body.classList.toggle("outline-collapsed");
  if (action === "check-update") void checkForUpdates().then(showToast);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionTarget = target.closest<HTMLElement>("[data-action]");
  if (actionTarget?.dataset.action) handleAction(actionTarget.dataset.action);
  const removeMerge = target.closest<HTMLElement>("[data-remove-merge]")?.dataset.removeMerge;
  if (removeMerge) {
    mergeFiles = mergeFiles.filter((file) => file.id !== removeMerge);
    renderMergeFiles();
  }
  const pageTarget = target.closest<HTMLElement>("[data-page]");
  if (pageTarget?.dataset.page) {
    const top = pageTarget.dataset.top ? Number(pageTarget.dataset.top) : null;
    navigateTo(Number(pageTarget.dataset.page), top);
  }
});

element<HTMLFormElement>("[data-role='annotation-form']").addEventListener("submit", (event) => {
  event.preventDefault();
  void submitAnnotation();
});

element<HTMLInputElement>("[data-role='current-page']").addEventListener("change", (event) => {
  navigateTo(Number((event.target as HTMLInputElement).value));
});

searchInput.addEventListener("input", () => refreshSearchResults());
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") moveSearchResult(event.shiftKey ? -1 : 1);
  if (event.key === "Escape") closeFind();
});

mergeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeMerge();
});

annotationDialog.addEventListener("close", () => {
  annotationDraft = null;
});

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  const key = event.key.toLowerCase();
  if (key === "o") {
    event.preventDefault();
    void openDocument();
  }
  if (key === "s") {
    event.preventDefault();
    void saveCurrentDocument(event.shiftKey);
  }
  if (key === "f") {
    event.preventDefault();
    openFind();
  }
  if (key === "g") {
    event.preventDefault();
    const input = element<HTMLInputElement>("[data-role='current-page']");
    input.focus();
    input.select();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

function wireThumbnailDragging(): void {
  const list = element<HTMLElement>("[data-role='thumbnail-list']");
  list.addEventListener("dragstart", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(".thumbnail");
    draggedPage = Number(item?.dataset.page ?? 0);
    item?.classList.add("thumbnail--dragging");
  });
  list.addEventListener("dragover", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(".thumbnail");
    if (!item || draggedPage === 0) return;
    event.preventDefault();
    list.querySelectorAll(".thumbnail--drop-target").forEach((node) => node.classList.remove("thumbnail--drop-target"));
    item.classList.add("thumbnail--drop-target");
  });
  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = (event.target as HTMLElement).closest<HTMLElement>(".thumbnail");
    const toPage = Number(target?.dataset.page ?? 0);
    if (state.documentId && draggedPage && toPage) {
      void editPage(reorderPage(state.documentId, draggedPage, toPage));
    }
    finishPageDrag();
  });
  list.addEventListener("dragend", finishPageDrag);
}

function finishPageDrag(): void {
  draggedPage = 0;
  document.querySelectorAll(".thumbnail--dragging, .thumbnail--drop-target").forEach((node) => {
    node.classList.remove("thumbnail--dragging", "thumbnail--drop-target");
  });
}

function wireMergeDragging(): void {
  const list = element<HTMLElement>("[data-role='merge-list']");
  list.addEventListener("dragstart", (event) => {
    draggedMergeId = (event.target as HTMLElement).closest<HTMLElement>("[data-merge-id]")?.dataset.mergeId ?? "";
  });
  list.addEventListener("dragover", (event) => {
    if (draggedMergeId) event.preventDefault();
  });
  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const targetId = (event.target as HTMLElement).closest<HTMLElement>("[data-merge-id]")?.dataset.mergeId;
    const from = mergeFiles.findIndex((file) => file.id === draggedMergeId);
    const to = mergeFiles.findIndex((file) => file.id === targetId);
    if (from >= 0 && to >= 0 && from !== to) {
      const [file] = mergeFiles.splice(from, 1);
      mergeFiles.splice(to, 0, file);
      renderMergeFiles();
    }
    draggedMergeId = "";
  });
  list.addEventListener("dragend", () => {
    draggedMergeId = "";
  });
}

function restorePanelSizes(): void {
  const pages = Number(localStorage.getItem("akbun-pdf.pages-width"));
  const outline = Number(localStorage.getItem("akbun-pdf.outline-width"));
  if (pages >= 150 && pages <= 360) document.body.style.setProperty("--pages-width", `${pages}px`);
  if (outline >= 180 && outline <= 420) document.body.style.setProperty("--outline-width", `${outline}px`);
}

function wirePanelResizers(): void {
  document.querySelectorAll<HTMLElement>("[data-resize-panel]").forEach((resizer) => {
    resizer.addEventListener("pointerdown", (event) => startPanelResize(event, resizer));
  });
}

function startPanelResize(event: PointerEvent, resizer: HTMLElement): void {
  const panel = resizer.dataset.resizePanel;
  const startX = event.clientX;
  const pages = element<HTMLElement>(".pages-panel").getBoundingClientRect().width;
  const outline = element<HTMLElement>(".outline-panel").getBoundingClientRect().width;
  resizer.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent): void => {
    const delta = moveEvent.clientX - startX;
    const width = panel === "pages" ? pages + delta : outline - delta;
    const clamped = Math.round(Math.min(panel === "pages" ? 360 : 420, Math.max(panel === "pages" ? 150 : 180, width)));
    const property = panel === "pages" ? "--pages-width" : "--outline-width";
    document.body.style.setProperty(property, `${clamped}px`);
    localStorage.setItem(`akbun-pdf.${panel}-width`, String(clamped));
  };
  const stop = (): void => {
    resizer.removeEventListener("pointermove", move);
    resizer.removeEventListener("pointerup", stop);
  };
  resizer.addEventListener("pointermove", move);
  resizer.addEventListener("pointerup", stop);
}
