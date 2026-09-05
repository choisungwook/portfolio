import type { DocumentState, OutlineItem, Thumbnail } from "./types";

let toastTimer: number | undefined;
let thumbnailSignature = "";

function element<T extends Element>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`missing element: ${selector}`);
  return match;
}

function makeThumbnail(item: Thumbnail, selected: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `thumbnail${selected ? " thumbnail--selected" : ""}`;
  button.type = "button";
  button.dataset.page = String(item.page);
  button.ariaLabel = item.label;
  button.draggable = true;

  const preview = document.createElement("span");
  preview.className = "thumbnail__page";
  preview.innerHTML = `
    <i class="thumbnail__eyebrow"></i>
    <i class="thumbnail__title"></i>
    <i class="thumbnail__line"></i>
    <i class="thumbnail__line thumbnail__line--short"></i>
    <i class="thumbnail__shape"></i>
  `;
  const canvas = document.createElement("canvas");
  canvas.dataset.thumbnailCanvas = String(item.page);
  preview.append(canvas);

  const number = document.createElement("span");
  number.className = "thumbnail__number";
  number.textContent = String(item.page);
  button.append(preview, number);
  return button;
}

function makeOutlineItem(item: OutlineItem, selected: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `outline-item${selected ? " outline-item--selected" : ""}`;
  button.type = "button";
  button.dataset.page = String(item.page);
  if (item.top !== null) button.dataset.top = String(item.top);
  button.style.setProperty("--depth", String(item.depth));

  const title = document.createElement("span");
  title.textContent = item.title;
  const page = document.createElement("span");
  page.className = "outline-item__page";
  page.textContent = String(item.page);
  button.append(title, page);
  return button;
}

function renderControls(state: DocumentState): void {
  const ready = state.phase === "ready";
  const pageInput = element<HTMLInputElement>("[data-role='current-page']");
  pageInput.value = String(state.currentPage);
  pageInput.disabled = !ready;
  element<HTMLElement>("[data-role='page-count']").textContent = String(state.pageCount);
  element<HTMLElement>("[data-role='zoom']").textContent = `${Math.round(state.zoom * 100)}%`;

  document.querySelectorAll<HTMLButtonElement>(
    "[data-action='previous-page'], [data-action='next-page'], [data-action='zoom-in'], [data-action='zoom-out'], [data-action='reset-zoom'], [data-document-control]",
  ).forEach((button) => {
    button.disabled = !ready;
  });
}

function renderThumbnails(state: DocumentState): void {
  const list = element<HTMLElement>("[data-role='thumbnail-list']");
  const signature = [
    state.documentId,
    ...state.thumbnails.map((item) => `${item.sourcePage}:${item.rotation}`),
  ].join("|");
  if (signature !== thumbnailSignature || list.childElementCount !== state.pageCount) {
    list.replaceChildren(...state.thumbnails.map((item) => (
      makeThumbnail(item, item.page === state.currentPage)
    )));
    thumbnailSignature = signature;
  } else {
    list.querySelectorAll<HTMLElement>("[data-page]").forEach((item) => {
      item.classList.toggle("thumbnail--selected", Number(item.dataset.page) === state.currentPage);
    });
  }
  element<HTMLElement>("[data-role='thumbnail-count']").textContent = String(state.pageCount);
}

function renderOutline(state: DocumentState): void {
  const list = element<HTMLElement>("[data-role='outline-list']");
  list.replaceChildren(...state.outline.map((item) => (
    makeOutlineItem(item, item.page === state.currentPage)
  )));
  const empty = element<HTMLElement>("[data-role='outline-empty']");
  empty.hidden = state.phase === "ready" && state.outline.length > 0;
  list.hidden = state.phase === "ready" && state.outline.length === 0;
}

export function renderDocument(state: DocumentState): void {
  document.body.dataset.phase = state.phase;
  document.body.classList.toggle("document-dirty", state.dirty);
  const title = state.title || "akbun-pdf";
  element<HTMLElement>("[data-role='title']").textContent = state.dirty ? `${title} •` : title;
  element<HTMLElement>("[data-role='error-message']").textContent = state.errorMessage
    ?? "파일이 손상되었거나 지원하지 않는 형식입니다.";
  document.querySelector<HTMLElement>(".pdf-page:not(.pdf-page--canvas)")
    ?.style.setProperty("--document-zoom", String(state.zoom));
  renderControls(state);
  renderThumbnails(state);
  renderOutline(state);
}

const contextViews = { outline: "outline-view", find: "find-view", ai: "ai-panel" } as const;

export type ContextTab = keyof typeof contextViews;

export function showContextTab(name: ContextTab): void {
  for (const [tab, role] of Object.entries(contextViews)) {
    element<HTMLElement>(`[data-role='${role}']`).hidden = tab !== name;
  }
  document.body.classList.toggle("ai-panel-open", name === "ai");
  document.querySelectorAll<HTMLButtonElement>(".context-tab").forEach((button) => {
    const active = button.dataset.contextTab === name;
    button.classList.toggle("context-tab--active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

export function isContextTabOpen(name: ContextTab): boolean {
  return !element<HTMLElement>(`[data-role='${contextViews[name]}']`).hidden;
}

export function showToast(text: string): void {
  const toast = element<HTMLElement>("[data-role='toast']");
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toastTimer = undefined;
  }, 2600);
}
