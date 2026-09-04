import { describe, expect, it } from "vitest";
import { fixtureFor } from "../ui/src/fixtures";
import { changeZoom, goToPage, normalizeState, previewPhase } from "../ui/src/state";

describe("document state", () => {
  it("clamps page navigation to the document", () => {
    const ready = fixtureFor("ready");
    expect(goToPage(ready, -2).currentPage).toBe(1);
    expect(goToPage(ready, 99).currentPage).toBe(ready.pageCount);
  });

  it("keeps zoom inside the supported range", () => {
    const ready = fixtureFor("ready");
    expect(normalizeState({ ...ready, zoom: 0 }).zoom).toBe(0.25);
    expect(changeZoom({ ...ready, zoom: 4 }, 0.1).zoom).toBe(4);
  });

  it("replaces non-finite control input with safe defaults", () => {
    const ready = fixtureFor("ready");
    const normalized = normalizeState({
      ...ready,
      currentPage: Number.NaN,
      pageCount: Number.POSITIVE_INFINITY,
      zoom: Number.NaN,
    });

    expect(normalized.currentPage).toBe(0);
    expect(normalized.pageCount).toBe(0);
    expect(normalized.zoom).toBe(1);
  });

  it("accepts only known visual preview states", () => {
    expect(previewPhase("?state=loading")).toBe("loading");
    expect(previewPhase("?state=unknown")).toBeNull();
  });
});
