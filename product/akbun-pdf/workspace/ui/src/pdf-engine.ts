import {
  getDocument,
  GlobalWorkerOptions,
  Util,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { OutlineItem, SearchFragment } from "./types";

interface PdfOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineNode[];
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export function configurePdfEngine(): void {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export class PdfDocumentAdapter {
  private constructor(
    private loadingTask: PDFDocumentLoadingTask,
    private document: PDFDocumentProxy,
  ) {}

  static async open(bytes: number[]): Promise<PdfDocumentAdapter> {
    const loadingTask = getDocument({ data: Uint8Array.from(bytes) });
    const document = await loadingTask.promise;
    return new PdfDocumentAdapter(loadingTask, document);
  }

  get pageCount(): number {
    return this.document.numPages;
  }

  async pageSize(page: number, scale = 1): Promise<PageSize> {
    const viewport = (await this.getPage(page)).getViewport({ scale });
    return { width: viewport.width, height: viewport.height };
  }

  async outline(): Promise<OutlineItem[]> {
    const root = await this.document.getOutline();
    const output: OutlineItem[] = [];
    await this.flattenOutline((root ?? []) as PdfOutlineNode[], 0, output);
    return output;
  }

  async renderPage(canvas: HTMLCanvasElement, pageNumber: number, scale: number): Promise<PageSize> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    page.cleanup();
    return { width: viewport.width, height: viewport.height };
  }

  async renderThumbnail(canvas: HTMLCanvasElement, pageNumber: number, width: number): Promise<void> {
    const page = await this.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1 });
    const scale = width / natural.width;
    const viewport = page.getViewport({ scale });
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    page.cleanup();
  }

  async searchFragments(pageNumber: number): Promise<SearchFragment[]> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    return content.items.flatMap((raw) => {
      if (!("str" in raw)) return [];
      const item = raw as PdfTextItem;
      const matrix = Util.transform(viewport.transform, item.transform);
      const height = Math.max(item.height, Math.hypot(matrix[2], matrix[3]));
      return [{
        text: item.str,
        rect: {
          x: matrix[4],
          y: matrix[5] - height,
          width: item.width,
          height,
        },
      }];
    });
  }

  async destroy(): Promise<void> {
    await this.loadingTask.destroy();
  }

  private getPage(page: number): Promise<PDFPageProxy> {
    return this.document.getPage(page);
  }

  private async flattenOutline(
    nodes: PdfOutlineNode[],
    depth: number,
    output: OutlineItem[],
  ): Promise<void> {
    for (const node of nodes) {
      const destination = typeof node.dest === "string"
        ? await this.document.getDestination(node.dest)
        : node.dest;
      if (destination) {
        const page = await this.resolvePage(destination[0]);
        if (page !== null) {
          output.push({
            id: `outline-${output.length + 1}`,
            title: node.title,
            page,
            top: typeof destination[3] === "number" ? destination[3] : null,
            depth,
          });
        }
      }
      await this.flattenOutline(node.items ?? [], depth + 1, output);
    }
  }

  private async resolvePage(reference: unknown): Promise<number | null> {
    if (typeof reference === "number") return reference + 1;
    if (!reference || typeof reference !== "object") return null;
    return (await this.document.getPageIndex(reference as { num: number; gen: number })) + 1;
  }
}
