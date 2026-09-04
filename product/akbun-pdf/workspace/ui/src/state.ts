import type { DocumentPhase, DocumentState } from "./types";

const previewPhases = new Set<DocumentPhase>(["empty", "loading", "ready", "error"]);

export function previewPhase(search: string): DocumentPhase | null {
  const value = new URLSearchParams(search).get("state") as DocumentPhase | null;
  return value && previewPhases.has(value) ? value : null;
}

export function normalizeState(state: DocumentState): DocumentState {
  const pageCount = Math.max(0, Math.floor(state.pageCount));
  const currentPage = pageCount === 0
    ? 0
    : Math.min(pageCount, Math.max(1, Math.floor(state.currentPage)));

  return {
    ...state,
    currentPage,
    pageCount,
    zoom: Math.min(4, Math.max(0.25, state.zoom)),
  };
}

export function goToPage(state: DocumentState, page: number): DocumentState {
  return normalizeState({ ...state, currentPage: page });
}

export function changeZoom(state: DocumentState, delta: number): DocumentState {
  const zoom = Math.round((state.zoom + delta) * 10) / 10;
  return normalizeState({ ...state, zoom });
}
