export type DocumentPhase = "empty" | "loading" | "ready" | "error";

export interface Thumbnail {
  page: number;
  label: string;
}

export interface OutlineItem {
  id: string;
  title: string;
  page: number;
  top: number | null;
  depth: number;
}

export interface DocumentState {
  phase: DocumentPhase;
  documentId: string | null;
  title: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  thumbnails: Thumbnail[];
  outline: OutlineItem[];
  errorMessage: string | null;
}

export interface OpenDocumentPayload {
  state: DocumentState;
  bytes: number[];
}

export interface PreservationReport {
  originalSize: number;
  savedSize: number;
  originalHash: string;
  savedHash: string;
  originalStreamHash: string;
  savedStreamHash: string;
  streamCount: number;
  unchanged: boolean;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchFragment {
  text: string;
  rect: PageRect;
}

export interface SearchResult {
  id: string;
  page: number;
  rects: PageRect[];
}

export type FitMode = "custom" | "actual" | "width" | "page";
