import type { DocumentPhase, DocumentState } from "./types";

const emptyState: DocumentState = {
  phase: "empty",
  title: "akbun-pdf",
  currentPage: 0,
  pageCount: 0,
  zoom: 1,
  thumbnails: [],
  outline: [],
  errorMessage: null,
};

export function fixtureFor(phase: DocumentPhase): DocumentState {
  if (phase === "loading") {
    return { ...emptyState, phase, title: "product-principles.pdf" };
  }

  if (phase === "error") {
    return {
      ...emptyState,
      phase,
      errorMessage: "파일이 손상되었거나 암호로 보호되어 있습니다.",
    };
  }

  if (phase === "ready") {
    return {
      phase,
      title: "product-principles.pdf",
      currentPage: 1,
      pageCount: 8,
      zoom: 1,
      thumbnails: Array.from({ length: 8 }, (_, index) => ({
        page: index + 1,
        label: `${index + 1}페이지`,
      })),
      outline: [
        { id: "intro", title: "들어가며", page: 1, depth: 0 },
        { id: "focus", title: "문서에 집중하기", page: 2, depth: 0 },
        { id: "hierarchy", title: "시각적 위계", page: 3, depth: 1 },
        { id: "navigation", title: "빠른 탐색", page: 5, depth: 0 },
        { id: "offline", title: "오프라인 작업", page: 7, depth: 0 },
      ],
      errorMessage: null,
    };
  }

  return { ...emptyState };
}
