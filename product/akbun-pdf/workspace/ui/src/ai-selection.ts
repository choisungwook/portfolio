export interface PageSelectionGesture {
  shiftKey: boolean;
  toggleKey: boolean;
  selectionMode: boolean;
}

export interface PageSelectionResult {
  pages: Set<number>;
  anchor: number;
}

export function parsePageRange(value: string, pageCount: number): number[] | null {
  const input = value.trim();
  if (!input || pageCount < 1) return null;
  const pages = new Set<number>();
  for (const token of input.split(",")) {
    const part = token.trim();
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!validPage(start, pageCount) || !validPage(end, pageCount) || start > end) return null;
      for (let page = start; page <= end; page += 1) pages.add(page);
      continue;
    }
    if (!/^\d+$/.test(part)) return null;
    const page = Number(part);
    if (!validPage(page, pageCount)) return null;
    pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

export function formatPageSelection(pages: Iterable<number>): string {
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  if (sorted.length === 0) return "선택 없음";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const page of sorted.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    ranges.push(formatRange(start, end));
    start = page;
    end = page;
  }
  ranges.push(formatRange(start, end));
  return `${ranges.join(", ")}페이지`;
}

export function applyPageSelection(
  selected: ReadonlySet<number>,
  page: number,
  anchor: number,
  pageCount: number,
  gesture: PageSelectionGesture,
): PageSelectionResult {
  if (!validPage(page, pageCount)) return { pages: new Set(selected), anchor };
  if (gesture.shiftKey && validPage(anchor, pageCount)) {
    const start = Math.min(anchor, page);
    const end = Math.max(anchor, page);
    return {
      pages: new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index)),
      anchor,
    };
  }
  if (gesture.toggleKey || gesture.selectionMode) {
    const pages = new Set(selected);
    if (pages.has(page)) pages.delete(page);
    else pages.add(page);
    return { pages, anchor: page };
  }
  return { pages: new Set([page]), anchor: page };
}

function validPage(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

function formatRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}-${end}`;
}
