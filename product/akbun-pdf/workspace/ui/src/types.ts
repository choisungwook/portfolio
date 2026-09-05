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
  snippet: string;
  matchStart: number;
  matchLength: number;
}

export type FitMode = "custom" | "actual" | "width" | "page";

export type AiProvider = "codex";
export type AiModel = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
export type AiRole = "user" | "assistant";

export interface AiSettings {
  version: number;
  provider: AiProvider;
  model: AiModel;
  effort: "low";
  systemPrompt: string;
}

export interface AiConversationMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AiMessage {
  id: string;
  role: AiRole;
  text: string;
  createdAt: string;
  pages: number[];
}

export interface AiConversation {
  meta: AiConversationMeta;
  messages: AiMessage[];
}

export interface AiConnection {
  state: "checking" | "available" | "unavailable";
  label: string;
  detail: string;
  version: string;
}

export interface AiTurnInput {
  type: "text" | "localImage";
  text?: string;
  path?: string;
}

export interface SummaryPageInput {
  page: number;
  text: string;
  imageDataUrl: string;
}
