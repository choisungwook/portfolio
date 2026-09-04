import { describe, expect, it } from "vitest";
import { DocumentSearch, normalizeSearchText } from "../ui/src/search";

const rect = { x: 0, y: 0, width: 100, height: 12 };

describe("document search", () => {
  it("normalizes composed Korean and ignores English case", () => {
    expect(normalizeSearchText("한글 PDF")).toBe(normalizeSearchText("한글 pdf"));
    const search = new DocumentSearch();
    search.begin(1);
    search.addPage(1, [{ text: "Cafe\u0301 한글 PDF", rect }]);
    expect(search.query("CAFÉ 한글 pdf")).toHaveLength(1);
  });

  it("returns results before every page is indexed", () => {
    const search = new DocumentSearch();
    search.begin(300);
    search.addPage(1, [{ text: "첫 번째 검색 결과", rect }]);
    expect(search.query("검색")[0]?.page).toBe(1);
    expect(search.progress()).toEqual({ indexed: 1, total: 300 });
  });

  it("returns one accurate match from each of 300 indexed pages", () => {
    const search = new DocumentSearch();
    search.begin(300);
    for (let page = 1; page <= 300; page += 1) {
      search.addPage(page, [{ text: `page ${page} ${"document text ".repeat(40)}searchable document`, rect }]);
    }
    const results = search.query("searchable document");
    expect(results).toHaveLength(300);
  });

  it("clears cached text when the document closes", () => {
    const search = new DocumentSearch();
    search.begin(1);
    search.addPage(1, [{ text: "private document text", rect }]);
    search.clear();
    expect(search.query("private")).toEqual([]);
    expect(search.progress()).toEqual({ indexed: 0, total: 0 });
  });
});
