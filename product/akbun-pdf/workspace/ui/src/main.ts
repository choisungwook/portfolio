import "./styles.css";
import "./viewer.css";
import {
  checkForUpdates,
  chooseAndOpenDocument,
  chooseAndSaveDocument,
  closeDocument,
  completeDocumentOpen,
  failDocumentOpen,
  getInitialState,
} from "./bridge";
import { configurePdfEngine, PdfDocumentAdapter } from "./pdf-engine";
import { renderDocument, showToast } from "./render";
import { changeZoom, goToPage, normalizeState } from "./state";
import type { DocumentState, FitMode, SearchResult } from "./types";
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

const searchPanel = element<HTMLElement>("[data-role='search-panel']");
const searchInput = element<HTMLInputElement>("[data-role='search-input']");
const searchStatus = element<HTMLElement>("[data-role='search-status']");
const viewer = new PdfViewer(
  element(".document-stage"),
  element(".viewer"),
  {
    onCurrentPage: (page) => updateState(goToPage(state, page)),
    onIndexProgress: () => refreshSearchResults(),
  },
);

renderDocument(state);
restorePanelSizes();
wirePanelResizers();

function updateState(next: DocumentState): void {
  state = normalizeState(next);
  renderDocument(state);
}

async function openDocument(): Promise<void> {
  let adapter: PdfDocumentAdapter | null = null;
  try {
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
    await viewer.open(viewerAdapter);
    refreshSearchResults();
  } catch (error) {
    if (adapter) await adapter.destroy();
    await viewer.close();
    if (state.documentId) {
      try {
        updateState(await failDocumentOpen(state.documentId, error));
      } catch {
        updateState({ ...state, phase: "error", errorMessage: String(error) });
      }
    } else {
      updateState({ ...state, phase: "error", errorMessage: String(error) });
    }
  }
}

async function closeCurrentDocument(): Promise<void> {
  await viewer.close();
  updateState(await closeDocument());
  closeFind();
}

async function saveCurrentDocument(): Promise<void> {
  if (!state.documentId) return;
  try {
    const report = await chooseAndSaveDocument(state.documentId, state.title);
    if (!report) return;
    const size = new Intl.NumberFormat("ko-KR").format(report.savedSize);
    showToast(report.unchanged
      ? `원본 byte와 파일 크기 보존 · ${size} bytes`
      : "저장 결과가 원본과 달라 저장을 확인해야 합니다.");
  } catch (error) {
    showToast(`저장 실패 · ${String(error)}`);
  }
}

function applyZoom(mode: FitMode, requested = state.zoom): void {
  const zoom = viewer.zoom(mode, requested);
  updateState({ ...state, zoom });
  if (!searchPanel.hidden) refreshSearchResults();
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
  refreshSearchStatus();
}

function refreshSearchStatus(): void {
  const progress = viewer.search.progress();
  const position = selectedResult < 0 ? 0 : selectedResult + 1;
  searchStatus.textContent = `${position} / ${searchResults.length} · ${progress.indexed}/${progress.total} 페이지`;
}

function handleAction(action: string): void {
  if (action === "open") void openDocument();
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
  if (action === "toggle-pages") document.body.classList.toggle("pages-collapsed");
  if (action === "toggle-outline") document.body.classList.toggle("outline-collapsed");
  if (action === "check-update") void checkForUpdates().then(showToast);
}

function navigateTo(page: number, top: number | null = null): void {
  const next = goToPage(state, page);
  updateState(next);
  viewer.goTo(next.currentPage, top);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionTarget = target.closest<HTMLElement>("[data-action]");
  if (actionTarget?.dataset.action) handleAction(actionTarget.dataset.action);

  const pageTarget = target.closest<HTMLElement>("[data-page]");
  if (pageTarget?.dataset.page) {
    const top = pageTarget.dataset.top ? Number(pageTarget.dataset.top) : null;
    navigateTo(Number(pageTarget.dataset.page), top);
  }
});

element<HTMLInputElement>("[data-role='current-page']").addEventListener("change", (event) => {
  navigateTo(Number((event.target as HTMLInputElement).value));
});

searchInput.addEventListener("input", () => refreshSearchResults());
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") moveSearchResult(event.shiftKey ? -1 : 1);
  if (event.key === "Escape") closeFind();
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
    void saveCurrentDocument();
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
