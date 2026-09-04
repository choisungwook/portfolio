export type DocumentPhase = "empty" | "loading" | "ready" | "error";

export interface Thumbnail {
  page: number;
  label: string;
}

export interface OutlineItem {
  id: string;
  title: string;
  page: number;
  depth: number;
}

export interface DocumentState {
  phase: DocumentPhase;
  title: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  thumbnails: Thumbnail[];
  outline: OutlineItem[];
  errorMessage: string | null;
}
