import type { PageRect, SearchFragment, SearchResult } from "./types";

interface IndexedFragment {
  start: number;
  end: number;
  rect: PageRect;
}

interface IndexedPage {
  text: string;
  fragments: IndexedFragment[];
}

const SNIPPET_MARGIN = 24;

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

// 조각 전체가 아니라 일치한 글자 구간만 잘라 낸다. 문장 전체가 강조되지 않게 하려는 것이고,
// 글자 폭을 알 수 없으므로 조각 안에서는 글자 수에 비례한다고 본다.
function matchRect(fragment: IndexedFragment, start: number, end: number): PageRect {
  const length = fragment.end - fragment.start;
  if (length <= 0) return fragment.rect;
  const from = Math.max(start, fragment.start) - fragment.start;
  const to = Math.min(end, fragment.end) - fragment.start;
  return {
    x: fragment.rect.x + (fragment.rect.width * from) / length,
    y: fragment.rect.y,
    width: (fragment.rect.width * (to - from)) / length,
    height: fragment.rect.height,
  };
}

export class DocumentSearch {
  private pages = new Map<number, IndexedPage>();
  private totalPages = 0;

  begin(totalPages: number): void {
    this.pages.clear();
    this.totalPages = totalPages;
  }

  clear(): void {
    this.pages.clear();
    this.totalPages = 0;
  }

  addPage(page: number, source: SearchFragment[]): void {
    let text = "";
    const fragments: IndexedFragment[] = [];
    for (const fragment of source) {
      const normalized = normalizeSearchText(fragment.text);
      if (!normalized) continue;
      if (text) text += " ";
      const start = text.length;
      text += normalized;
      fragments.push({ start, end: text.length, rect: fragment.rect });
    }
    this.pages.set(page, { text, fragments });
  }

  progress(): { indexed: number; total: number } {
    return { indexed: this.pages.size, total: this.totalPages };
  }

  query(value: string): SearchResult[] {
    const query = normalizeSearchText(value.trim());
    if (!query) return [];
    const results: SearchResult[] = [];

    for (const [page, indexed] of this.pages) {
      let offset = 0;
      while (offset <= indexed.text.length - query.length) {
        const start = indexed.text.indexOf(query, offset);
        if (start < 0) break;
        const end = start + query.length;
        const rects = indexed.fragments
          .filter((fragment) => fragment.start < end && fragment.end > start)
          .map((fragment) => matchRect(fragment, start, end));
        const snippetStart = Math.max(0, start - SNIPPET_MARGIN);
        results.push({
          id: `${page}-${start}`,
          page,
          rects,
          snippet: indexed.text.slice(snippetStart, end + SNIPPET_MARGIN),
          matchStart: start - snippetStart,
          matchLength: query.length,
        });
        offset = start + Math.max(1, query.length);
      }
    }
    return results;
  }
}
