export type DocumentPhase = "empty" | "loading" | "ready" | "error";

export interface Thumbnail {
  page: number;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
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
  dirty: boolean;
  thumbnails: Thumbnail[];
  outline: OutlineItem[];
  annotations: Annotation[];
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
  unchanged: boolean;
  contentStreamsPreserved: boolean;
  objectStreamsPreserved: boolean;
}

export interface SaveResult {
  state: DocumentState;
  bytes: number[];
  report: PreservationReport;
}

export type AnnotationKind = "highlight" | "note";

export interface PdfRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  id: string;
  page: number;
  kind: AnnotationKind;
  rect: PdfRect;
  color: string;
  contents: string;
}

export interface AnnotationDraft {
  id: string | null;
  page: number;
  kind: AnnotationKind;
  rect: PdfRect;
  color: string;
  contents: string;
}

export interface MergeFile {
  id: string;
  title: string;
  pageCount: number;
  errorMessage: string | null;
}

export interface MergeReport {
  pageCount: number;
  savedSize: number;
  contentStreamsPreserved: boolean;
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
