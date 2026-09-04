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

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
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
          .map((fragment) => fragment.rect);
        results.push({ id: `${page}-${start}`, page, rects });
        offset = start + Math.max(1, query.length);
      }
    }
    return results;
  }
}
