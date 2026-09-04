import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export function configurePdfEngine(): void {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}
