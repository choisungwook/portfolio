import { PdfDocumentAdapter, type PageSize } from "./pdf-engine";
import { DocumentSearch } from "./search";
import type {
  Annotation,
  AnnotationKind,
  FitMode,
  PageRect,
  PdfRect,
  SearchResult,
  Thumbnail,
} from "./types";

interface ViewerCallbacks {
  onCurrentPage: (page: number) => void;
  onIndexProgress: () => void;
  onCreateAnnotation: (kind: AnnotationKind, page: number, rect: PdfRect) => void;
  onEditAnnotation: (annotationId: string) => void;
}

export class PdfViewer {
  readonly search = new DocumentSearch();
  private adapter: PdfDocumentAdapter | null = null;
  private observer: IntersectionObserver | null = null;
  private baseSize: PageSize = { width: 612, height: 792 };
  private pages: Thumbnail[] = [];
  private annotations: Annotation[] = [];
  private annotationGeneration = 0;
  private tool: AnnotationKind | null = null;
  private scale = 1;
  private generation = 0;
  private currentPage = 1;
  private visiblePages = new Map<number, number>();

  constructor(
    private stage: HTMLElement,
    private viewport: HTMLElement,
    private callbacks: ViewerCallbacks,
  ) {}

  async open(
    adapter: PdfDocumentAdapter,
    pages: Thumbnail[],
    annotations: Annotation[],
  ): Promise<void> {
    if (this.adapter) await this.close();
    this.adapter = adapter;
    this.currentPage = 1;
    this.stage.classList.add("document-stage--pdf");
    await this.updateDocument(pages, annotations);
  }

  async updateDocument(pages: Thumbnail[], annotations: Annotation[]): Promise<void> {
    const adapter = this.adapter;
    if (!adapter || pages.length === 0) return;
    this.generation += 1;
    const generation = this.generation;
    this.observer?.disconnect();
    this.visiblePages.clear();
    this.pages = pages.map((page) => ({ ...page }));
    this.annotations = annotations.map((annotation) => ({ ...annotation, rect: { ...annotation.rect } }));
    this.currentPage = Math.min(this.currentPage, pages.length);
    const first = this.pages[0];
    this.baseSize = await adapter.pageSize(first.sourcePage, 1, first.rotation);
    this.search.begin(pages.length);
    this.createPageSurfaces();
    this.observePages();
    await this.renderPage(this.currentPage, generation);
    void this.renderThumbnails(generation);
    void this.indexText(generation);
    void this.showAnnotations(this.annotations);
  }

  async close(): Promise<void> {
    this.generation += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.visiblePages.clear();
    this.search.clear();
    this.pages = [];
    this.annotations = [];
    this.annotationGeneration += 1;
    this.stage.classList.remove("document-stage--pdf");
    this.stage.replaceChildren();
    document.querySelector<HTMLElement>("[data-role='thumbnail-list']")?.replaceChildren();
    const adapter = this.adapter;
    this.adapter = null;
    if (adapter) await adapter.destroy();
  }

  setTool(tool: AnnotationKind | null): void {
    this.tool = tool;
    this.stage.dataset.annotationTool = tool ?? "";
  }

  zoom(mode: FitMode, requested = this.scale): number {
    if (!this.adapter) return this.scale;
    const horizontalSpace = Math.max(240, this.viewport.clientWidth - 88);
    const verticalSpace = Math.max(240, this.viewport.clientHeight - 88);
    if (mode === "actual") this.scale = 1;
    if (mode === "width") this.scale = horizontalSpace / this.baseSize.width;
    if (mode === "page") {
      this.scale = Math.min(horizontalSpace / this.baseSize.width, verticalSpace / this.baseSize.height);
    }
    if (mode === "custom") this.scale = requested;
    this.scale = Math.min(4, Math.max(0.25, this.scale));
    this.resizeSurfaces();
    this.invalidateVisiblePages();
    void this.showAnnotations(this.annotations);
    return this.scale;
  }

  goTo(page: number, top: number | null = null): void {
    const target = this.surface(page);
    if (!target) return;
    const offset = top === null ? 0 : Math.max(0, this.baseSize.height - top) * this.scale;
    this.viewport.scrollTo({ top: target.offsetTop + offset - 28, behavior: "smooth" });
    this.setCurrentPage(page);
    void this.renderPage(page, this.generation);
  }

  showSearchResults(results: SearchResult[], selected: number): void {
    this.stage.querySelectorAll(".search-highlight").forEach((node) => node.remove());
    results.forEach((result, resultIndex) => {
      const layer = this.surface(result.page)?.querySelector<HTMLElement>(".search-highlights");
      if (!layer) return;
      result.rects.forEach((rect) => {
        const highlight = document.createElement("mark");
        highlight.className = `search-highlight${resultIndex === selected ? " search-highlight--current" : ""}`;
        setRectStyle(highlight, scaledRect(rect, this.scale));
        layer.append(highlight);
      });
    });
  }

  async showAnnotations(annotations: Annotation[]): Promise<void> {
    this.annotations = annotations.map((annotation) => ({ ...annotation, rect: { ...annotation.rect } }));
    this.stage.querySelectorAll(".pdf-annotation").forEach((node) => node.remove());
    const adapter = this.adapter;
    if (!adapter) return;
    const generation = this.generation;
    const annotationGeneration = ++this.annotationGeneration;
    for (const annotation of annotations) {
      const page = this.pages[annotation.page - 1];
      const layer = this.surface(annotation.page)?.querySelector<HTMLElement>(".annotation-layer");
      if (!page || !layer) continue;
      const rect = await adapter.pdfRectToViewport(
        page.sourcePage,
        annotation.rect,
        this.scale,
        page.rotation,
      );
      if (generation !== this.generation || annotationGeneration !== this.annotationGeneration) return;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `pdf-annotation pdf-annotation--${annotation.kind}`;
      marker.dataset.annotationId = annotation.id;
      marker.title = annotation.contents || (annotation.kind === "highlight" ? "형광펜" : "메모");
      marker.style.setProperty("--annotation-color", annotation.color);
      setRectStyle(marker, rect);
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.onEditAnnotation(annotation.id);
      });
      layer.append(marker);
    }
  }

  private createPageSurfaces(): void {
    const surfaces = this.pages.map((page) => {
      const surface = document.createElement("article");
      surface.className = "pdf-page pdf-page--canvas";
      surface.dataset.pdfPage = String(page.page);
      surface.dataset.sourcePage = String(page.sourcePage);
      surface.dataset.rotation = String(page.rotation);
      surface.innerHTML = `
        <canvas aria-label="${page.page}페이지"></canvas>
        <div class="text-layer"></div>
        <div class="search-highlights"></div>
        <div class="annotation-layer"></div>
        <span class="pdf-page__number">${page.page}</span>
      `;
      surface.querySelector(".text-layer")?.addEventListener("pointerup", () => {
        window.setTimeout(() => void this.captureTextSelection(page.page), 0);
      });
      surface.addEventListener("click", (event) => void this.createNote(page.page, event));
      return surface;
    });
    this.stage.replaceChildren(...surfaces);
    this.resizeSurfaces();
  }

  private resizeSurfaces(): void {
    this.stage.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((surface) => {
      surface.style.width = `${this.baseSize.width * this.scale}px`;
      surface.style.height = `${this.baseSize.height * this.scale}px`;
      surface.style.setProperty("--total-scale-factor", String(this.scale));
      surface.dataset.renderScale = "";
    });
    this.showSearchResults([], -1);
  }

  private observePages(): void {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const page = Number((entry.target as HTMLElement).dataset.pdfPage);
        if (entry.isIntersecting) {
          this.visiblePages.set(page, entry.intersectionRatio);
          void this.renderPage(page, this.generation);
        } else {
          this.visiblePages.delete(page);
        }
      });
      this.selectMostVisiblePage();
    }, { root: this.viewport, threshold: [0, 0.25, 0.5, 0.75, 1] });
    this.stage.querySelectorAll("[data-pdf-page]").forEach((page) => this.observer?.observe(page));
  }

  private async renderPage(pageNumber: number, generation: number): Promise<void> {
    const adapter = this.adapter;
    const page = this.pages[pageNumber - 1];
    const surface = this.surface(pageNumber);
    const canvas = surface?.querySelector<HTMLCanvasElement>("canvas");
    const textLayer = surface?.querySelector<HTMLElement>(".text-layer");
    if (!adapter || !page || !surface || !canvas || !textLayer || generation !== this.generation) return;
    if (surface.dataset.renderScale === String(this.scale)) return;
    surface.dataset.renderScale = String(this.scale);
    const size = await adapter.renderPage(
      canvas,
      textLayer,
      page.sourcePage,
      this.scale,
      page.rotation,
    );
    if (generation !== this.generation) return;
    surface.style.width = `${size.width}px`;
    surface.style.height = `${size.height}px`;
    void this.showAnnotations(this.annotations);
  }

  private async renderThumbnails(generation: number): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    for (const page of this.pages) {
      if (generation !== this.generation) return;
      const canvas = document.querySelector<HTMLCanvasElement>(
        `[data-thumbnail-canvas='${page.page}']`,
      );
      if (canvas) await adapter.renderThumbnail(canvas, page.sourcePage, 116, page.rotation);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  private async indexText(generation: number): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    for (const page of this.pages) {
      if (generation !== this.generation) return;
      try {
        this.search.addPage(
          page.page,
          await adapter.searchFragments(page.sourcePage, page.rotation),
        );
      } catch {
        this.search.addPage(page.page, []);
      }
      this.callbacks.onIndexProgress();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  private async captureTextSelection(pageNumber: number): Promise<void> {
    if (this.tool !== "highlight") return;
    const adapter = this.adapter;
    const page = this.pages[pageNumber - 1];
    const surface = this.surface(pageNumber);
    const selection = window.getSelection();
    if (!adapter || !page || !surface || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const textLayer = surface.querySelector(".text-layer");
    if (!textLayer?.contains(range.commonAncestorContainer)) return;
    const surfaceRect = surface.getBoundingClientRect();
    const rectangles = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (rectangles.length === 0) return;
    const left = Math.max(surfaceRect.left, Math.min(...rectangles.map((rect) => rect.left)));
    const top = Math.max(surfaceRect.top, Math.min(...rectangles.map((rect) => rect.top)));
    const right = Math.min(surfaceRect.right, Math.max(...rectangles.map((rect) => rect.right)));
    const bottom = Math.min(surfaceRect.bottom, Math.max(...rectangles.map((rect) => rect.bottom)));
    const rect = await adapter.viewportRectToPdf(
      page.sourcePage,
      { x: left - surfaceRect.left, y: top - surfaceRect.top, width: right - left, height: bottom - top },
      this.scale,
      page.rotation,
    );
    selection.removeAllRanges();
    this.callbacks.onCreateAnnotation("highlight", pageNumber, rect);
  }

  private async createNote(pageNumber: number, event: MouseEvent): Promise<void> {
    if (this.tool !== "note" || (event.target as HTMLElement).closest(".pdf-annotation")) return;
    const adapter = this.adapter;
    const page = this.pages[pageNumber - 1];
    const surface = this.surface(pageNumber);
    if (!adapter || !page || !surface) return;
    const bounds = surface.getBoundingClientRect();
    const size = 24;
    const rect = await adapter.viewportRectToPdf(
      page.sourcePage,
      {
        x: Math.max(0, event.clientX - bounds.left - size / 2),
        y: Math.max(0, event.clientY - bounds.top - size / 2),
        width: size,
        height: size,
      },
      this.scale,
      page.rotation,
    );
    this.callbacks.onCreateAnnotation("note", pageNumber, rect);
  }

  private invalidateVisiblePages(): void {
    const view = this.viewport.getBoundingClientRect();
    this.stage.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((surface) => {
      const rect = surface.getBoundingClientRect();
      if (rect.bottom >= view.top - view.height && rect.top <= view.bottom + view.height) {
        void this.renderPage(Number(surface.dataset.pdfPage), this.generation);
      }
    });
  }

  private selectMostVisiblePage(): void {
    let page = this.currentPage;
    let ratio = -1;
    for (const [candidate, visibleRatio] of this.visiblePages) {
      if (visibleRatio > ratio) {
        page = candidate;
        ratio = visibleRatio;
      }
    }
    this.setCurrentPage(page);
  }

  private setCurrentPage(page: number): void {
    if (this.currentPage === page) return;
    this.currentPage = page;
    this.callbacks.onCurrentPage(page);
  }

  private surface(page: number): HTMLElement | null {
    return this.stage.querySelector<HTMLElement>(`[data-pdf-page='${page}']`);
  }
}

function scaledRect(rect: PageRect, scale: number): PageRect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: Math.max(2, rect.width * scale),
    height: Math.max(2, rect.height * scale),
  };
}

function setRectStyle(element: HTMLElement, rect: PageRect): void {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${Math.max(2, rect.width)}px`;
  element.style.height = `${Math.max(2, rect.height)}px`;
}
