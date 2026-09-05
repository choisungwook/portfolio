import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  Util,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import jbig2WasmUrl from "pdfjs-dist/wasm/jbig2.wasm?url";
import jbig2FallbackUrl from "pdfjs-dist/wasm/jbig2_nowasm_fallback.js?url";
import openjpegWasmUrl from "pdfjs-dist/wasm/openjpeg.wasm?url";
import openjpegFallbackUrl from "pdfjs-dist/wasm/openjpeg_nowasm_fallback.js?url";
import qcmsWasmUrl from "pdfjs-dist/wasm/qcms_bg.wasm?url";
import quickjsUrl from "pdfjs-dist/wasm/quickjs-eval.js?url";
import quickjsWasmUrl from "pdfjs-dist/wasm/quickjs-eval.wasm?url";
import type {
  OutlineItem,
  PageRect,
  PdfRect,
  SearchFragment,
  SummaryPageInput,
} from "./types";

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

const pdfWasmAssetUrls = [
  jbig2WasmUrl,
  jbig2FallbackUrl,
  openjpegWasmUrl,
  openjpegFallbackUrl,
  qcmsWasmUrl,
  quickjsUrl,
  quickjsWasmUrl,
];

export function sharedAssetDirectory(assetUrls: string[], baseUrl: string): string {
  const directories = new Set(assetUrls.map((assetUrl) => (
    new URL(".", new URL(assetUrl, baseUrl)).href
  )));
  if (directories.size !== 1) throw new Error("PDF.js 런타임 자산 경로가 일치하지 않습니다.");
  return [...directories][0];
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
    const loadingTask = getDocument({
      data: Uint8Array.from(bytes),
      wasmUrl: sharedAssetDirectory(pdfWasmAssetUrls, window.document.baseURI),
    });
    const document = await loadingTask.promise;
    return new PdfDocumentAdapter(loadingTask, document);
  }

  get pageCount(): number {
    return this.document.numPages;
  }

  async pageSize(page: number, scale = 1, rotation = 0): Promise<PageSize> {
    const pdfPage = await this.getPage(page);
    const viewport = pdfPage.getViewport({ scale, rotation: pdfPage.rotate + rotation });
    return { width: viewport.width, height: viewport.height };
  }

  async outline(): Promise<OutlineItem[]> {
    const root = await this.document.getOutline();
    const output: OutlineItem[] = [];
    await this.flattenOutline((root ?? []) as PdfOutlineNode[], 0, output);
    return output;
  }

  async renderPage(
    canvas: HTMLCanvasElement,
    textContainer: HTMLElement,
    pageNumber: number,
    scale: number,
    rotation = 0,
  ): Promise<PageSize> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    textContainer.replaceChildren();
    const textLayer = new TextLayer({
      textContentSource: await page.getTextContent(),
      container: textContainer,
      viewport,
    });
    await Promise.all([
      page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      }).promise,
      textLayer.render(),
    ]);
    page.cleanup();
    return { width: viewport.width, height: viewport.height };
  }

  async renderThumbnail(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    width: number,
    rotation = 0,
  ): Promise<void> {
    const page = await this.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1, rotation: page.rotate + rotation });
    const scale = width / natural.width;
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
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

  async summaryInput(
    pageNumber: number,
    displayPage: number,
    rotation = 0,
  ): Promise<SummaryPageInput> {
    const page = await this.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1, rotation: page.rotate + rotation });
    const scale = Math.min(1.5, 1400 / natural.width);
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const [content] = await Promise.all([
      page.getTextContent(),
      page.render({ canvas, viewport }).promise,
    ]);
    const text = content.items
      .flatMap((item) => "str" in item ? [item.str] : [])
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100_000);
    const imageDataUrl = canvas.toDataURL("image/png");
    page.cleanup();
    return { page: displayPage, text, imageDataUrl };
  }

  async viewportRectToPdf(
    pageNumber: number,
    rect: PageRect,
    scale: number,
    rotation = 0,
  ): Promise<PdfRect> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
    const first = viewport.convertToPdfPoint(rect.x, rect.y);
    const second = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height);
    return {
      x1: Math.min(first[0], second[0]),
      y1: Math.min(first[1], second[1]),
      x2: Math.max(first[0], second[0]),
      y2: Math.max(first[1], second[1]),
    };
  }

  async pdfRectToViewport(
    pageNumber: number,
    rect: PdfRect,
    scale: number,
    rotation = 0,
  ): Promise<PageRect> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
    const first = viewport.convertToViewportPoint(rect.x1, rect.y1);
    const second = viewport.convertToViewportPoint(rect.x2, rect.y2);
    const x = Math.min(first[0], second[0]);
    const y = Math.min(first[1], second[1]);
    return {
      x,
      y,
      width: Math.abs(second[0] - first[0]),
      height: Math.abs(second[1] - first[1]),
    };
  }

  async searchFragments(pageNumber: number, rotation = 0): Promise<SearchFragment[]> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation: page.rotate + rotation });
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
