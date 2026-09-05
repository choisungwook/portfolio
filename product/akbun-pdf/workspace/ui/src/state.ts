import type { DocumentPhase, DocumentState } from "./types";

const previewPhases = new Set<DocumentPhase>(["empty", "loading", "ready", "error"]);

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function previewPhase(search: string): DocumentPhase | null {
  const value = new URLSearchParams(search).get("state") as DocumentPhase | null;
  return value && previewPhases.has(value) ? value : null;
}

export function normalizeState(state: DocumentState): DocumentState {
  const pageCount = Math.max(0, Math.floor(finiteOr(state.pageCount, 0)));
  const wantedPage = finiteOr(state.currentPage, pageCount === 0 ? 0 : 1);
  const currentPage = pageCount === 0
    ? 0
    : Math.min(pageCount, Math.max(1, Math.floor(wantedPage)));
  const zoom = finiteOr(state.zoom, 1);

  return {
    ...state,
    currentPage,
    pageCount,
    zoom: Math.min(4, Math.max(0.25, zoom)),
  };
}

export function errorState(error: unknown): DocumentState {
  return {
    phase: "error",
    documentId: null,
    title: "akbun-pdf",
    currentPage: 0,
    pageCount: 0,
    zoom: 1,
    dirty: false,
    thumbnails: [],
    outline: [],
    annotations: [],
    errorMessage: String(error),
  };
}

export function goToPage(state: DocumentState, page: number): DocumentState {
  return normalizeState({ ...state, currentPage: page });
}

export function changeZoom(state: DocumentState, delta: number): DocumentState {
  const zoom = Math.round((state.zoom + delta) * 10) / 10;
  return normalizeState({ ...state, zoom });
}
