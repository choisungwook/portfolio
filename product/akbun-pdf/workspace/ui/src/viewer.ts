import { PdfDocumentAdapter, type PageSize } from "./pdf-engine";
import { DocumentSearch } from "./search";
import type { FitMode, SearchResult } from "./types";

interface ViewerCallbacks {
  onCurrentPage: (page: number) => void;
  onIndexProgress: () => void;
}

export class PdfViewer {
  readonly search = new DocumentSearch();
  private adapter: PdfDocumentAdapter | null = null;
  private observer: IntersectionObserver | null = null;
  private baseSize: PageSize = { width: 612, height: 792 };
  private scale = 1;
  private generation = 0;
  private currentPage = 1;
  private scrollFrame = 0;

  constructor(
    private stage: HTMLElement,
    private viewport: HTMLElement,
    private callbacks: ViewerCallbacks,
  ) {
    this.viewport.addEventListener("scroll", () => this.scheduleCurrentPage());
  }

  async open(adapter: PdfDocumentAdapter): Promise<void> {
    if (this.adapter) await this.close();
    this.adapter = adapter;
    this.generation += 1;
    const generation = this.generation;
    this.currentPage = 1;
    this.baseSize = await adapter.pageSize(1);
    this.search.begin(adapter.pageCount);
    this.stage.classList.add("document-stage--pdf");
    this.createPageSurfaces(adapter.pageCount);
    this.observePages();
    await this.renderPage(1, generation);
    void this.renderThumbnails(generation);
    void this.indexText(generation);
  }

  async close(): Promise<void> {
    this.generation += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.search.clear();
    this.stage.classList.remove("document-stage--pdf");
    this.stage.replaceChildren();
    document.querySelector<HTMLElement>("[data-role='thumbnail-list']")?.replaceChildren();
    const adapter = this.adapter;
    this.adapter = null;
    if (adapter) await adapter.destroy();
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
    return this.scale;
  }

  goTo(page: number, top: number | null = null): void {
    const target = this.stage.querySelector<HTMLElement>(`[data-pdf-page='${page}']`);
    if (!target) return;
    const offset = top === null ? 0 : Math.max(0, this.baseSize.height - top) * this.scale;
    this.viewport.scrollTo({ top: target.offsetTop + offset - 28, behavior: "smooth" });
    this.setCurrentPage(page);
    void this.renderPage(page, this.generation);
  }

  showSearchResults(results: SearchResult[], selected: number): void {
    this.stage.querySelectorAll(".search-highlight").forEach((node) => node.remove());
    results.forEach((result, resultIndex) => {
      const layer = this.stage.querySelector<HTMLElement>(
        `[data-pdf-page='${result.page}'] .search-highlights`,
      );
      if (!layer) return;
      result.rects.forEach((rect) => {
        const highlight = document.createElement("mark");
        highlight.className = `search-highlight${resultIndex === selected ? " search-highlight--current" : ""}`;
        highlight.style.left = `${rect.x * this.scale}px`;
        highlight.style.top = `${rect.y * this.scale}px`;
        highlight.style.width = `${Math.max(2, rect.width * this.scale)}px`;
        highlight.style.height = `${Math.max(2, rect.height * this.scale)}px`;
        layer.append(highlight);
      });
    });
  }

  private createPageSurfaces(pageCount: number): void {
    const surfaces = Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      const surface = document.createElement("article");
      surface.className = "pdf-page pdf-page--canvas";
      surface.dataset.pdfPage = String(page);
      surface.innerHTML = `<canvas aria-label="${page}페이지"></canvas><div class="search-highlights"></div><span class="pdf-page__number">${page}</span>`;
      return surface;
    });
    this.stage.replaceChildren(...surfaces);
    this.resizeSurfaces();
  }

  private resizeSurfaces(): void {
    this.stage.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((surface) => {
      surface.style.width = `${this.baseSize.width * this.scale}px`;
      surface.style.height = `${this.baseSize.height * this.scale}px`;
      surface.dataset.renderScale = "";
    });
    this.showSearchResults([], -1);
  }

  private observePages(): void {
    this.observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        const page = Number((entry.target as HTMLElement).dataset.pdfPage);
        void this.renderPage(page, this.generation);
      });
    }, { root: this.viewport, rootMargin: "80% 0px" });
    this.stage.querySelectorAll("[data-pdf-page]").forEach((page) => this.observer?.observe(page));
  }

  private async renderPage(page: number, generation: number): Promise<void> {
    const adapter = this.adapter;
    const surface = this.stage.querySelector<HTMLElement>(`[data-pdf-page='${page}']`);
    const canvas = surface?.querySelector<HTMLCanvasElement>("canvas");
    if (!adapter || !surface || !canvas || generation !== this.generation) return;
    if (surface.dataset.renderScale === String(this.scale)) return;
    surface.dataset.renderScale = String(this.scale);
    const size = await adapter.renderPage(canvas, page, this.scale);
    if (generation !== this.generation) return;
    surface.style.width = `${size.width}px`;
    surface.style.height = `${size.height}px`;
  }

  private async renderThumbnails(generation: number): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    for (let page = 1; page <= adapter.pageCount; page += 1) {
      if (generation !== this.generation) return;
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-thumbnail-canvas='${page}']`);
      if (canvas) await adapter.renderThumbnail(canvas, page, 116);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  private async indexText(generation: number): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    for (let page = 1; page <= adapter.pageCount; page += 1) {
      if (generation !== this.generation) return;
      try {
        this.search.addPage(page, await adapter.searchFragments(page));
      } catch {
        this.search.addPage(page, []);
      }
      this.callbacks.onIndexProgress();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
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

  private scheduleCurrentPage(): void {
    if (this.scrollFrame) return;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const center = this.viewport.getBoundingClientRect().top + this.viewport.clientHeight / 2;
      let nearest = this.currentPage;
      let distance = Number.POSITIVE_INFINITY;
      this.stage.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((surface) => {
        const rect = surface.getBoundingClientRect();
        const wanted = Math.abs(rect.top + rect.height / 2 - center);
        if (wanted < distance) {
          distance = wanted;
          nearest = Number(surface.dataset.pdfPage);
        }
      });
      this.setCurrentPage(nearest);
    });
  }

  private setCurrentPage(page: number): void {
    if (this.currentPage === page) return;
    this.currentPage = page;
    this.callbacks.onCurrentPage(page);
  }
}
