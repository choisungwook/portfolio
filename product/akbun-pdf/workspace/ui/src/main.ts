import "./styles.css";
import { checkForUpdates, getInitialState } from "./bridge";
import { configurePdfEngine } from "./pdf-engine";
import { renderDocument, showToast } from "./render";
import { changeZoom, goToPage, normalizeState } from "./state";
import type { DocumentState } from "./types";

configurePdfEngine();

let state: DocumentState = await getInitialState();
renderDocument(state);

function updateState(next: DocumentState): void {
  state = normalizeState(next);
  renderDocument(state);
}

function openPlaceholder(): void {
  showToast("파일 열기는 다음 단계에서 PDF core와 연결됩니다.");
}

function handleAction(action: string): void {
  if (action === "open") return openPlaceholder();
  if (action === "previous-page") return updateState(goToPage(state, state.currentPage - 1));
  if (action === "next-page") return updateState(goToPage(state, state.currentPage + 1));
  if (action === "zoom-in") return updateState(changeZoom(state, 0.1));
  if (action === "zoom-out") return updateState(changeZoom(state, -0.1));
  if (action === "reset-zoom") return updateState({ ...state, zoom: 1 });
  if (action === "toggle-pages") {
    document.body.classList.toggle("pages-collapsed");
    return;
  }
  if (action === "toggle-outline") {
    document.body.classList.toggle("outline-collapsed");
    return;
  }
  if (action === "check-update") {
    void checkForUpdates().then(showToast);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionTarget = target.closest<HTMLElement>("[data-action]");
  if (actionTarget?.dataset.action) handleAction(actionTarget.dataset.action);

  const pageTarget = target.closest<HTMLElement>("[data-page]");
  if (pageTarget?.dataset.page) updateState(goToPage(state, Number(pageTarget.dataset.page)));
});

document.querySelector<HTMLInputElement>("[data-role='current-page']")?.addEventListener("change", (event) => {
  updateState(goToPage(state, Number((event.target as HTMLInputElement).value)));
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openPlaceholder();
  }
});
