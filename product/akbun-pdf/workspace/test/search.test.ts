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

  it("highlights only the matched word inside a long fragment", () => {
    const search = new DocumentSearch();
    search.begin(1);
    search.addPage(1, [{ text: "0123456789", rect: { x: 0, y: 0, width: 100, height: 12 } }]);
    const [result] = search.query("234");
    expect(result.rects).toEqual([{ x: 20, y: 0, width: 30, height: 12 }]);
    expect(result.snippet.slice(result.matchStart, result.matchStart + result.matchLength)).toBe("234");
  });

  it("splits a match that spans two fragments into two rects", () => {
    const search = new DocumentSearch();
    search.begin(1);
    search.addPage(1, [
      { text: "ab", rect: { x: 0, y: 0, width: 20, height: 10 } },
      { text: "cd", rect: { x: 30, y: 0, width: 20, height: 10 } },
    ]);
    // 조각 사이에 공백 한 칸이 끼므로 "b c"가 두 조각에 걸친 일치가 된다.
    expect(search.query("b c")[0].rects).toEqual([
      { x: 10, y: 0, width: 10, height: 10 },
      { x: 30, y: 0, width: 10, height: 10 },
    ]);
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
