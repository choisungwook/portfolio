import { describe, expect, it } from "vitest";
import { groupSelectionRows } from "../ui/src/viewer";

const bounds = { left: 100, top: 50, right: 700, bottom: 850 } as DOMRect;

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, right: left + width, bottom: top + height } as DOMRect;
}

describe("highlight selection rows", () => {
  it("merges rects on the same line and keeps separate lines apart", () => {
    const rows = groupSelectionRows([
      clientRect(120, 70, 40, 14),
      clientRect(170, 71, 60, 14),
      clientRect(120, 95, 80, 14),
    ], bounds);
    expect(rows).toEqual([
      { x: 20, y: 20, width: 110, height: 15 },
      { x: 20, y: 45, width: 80, height: 14 },
    ]);
  });

  it("keeps the full line height when a later rect sits higher", () => {
    const rows = groupSelectionRows([
      clientRect(120, 74, 40, 12),
      clientRect(170, 70, 60, 12),
    ], bounds);
    expect(rows).toEqual([{ x: 20, y: 20, width: 110, height: 16 }]);
  });

  it("clips a selection that runs past the page and drops empty rects", () => {
    const rows = groupSelectionRows([
      clientRect(60, 30, 200, 40),
      clientRect(800, 100, 40, 14),
    ], bounds);
    expect(rows).toEqual([{ x: 0, y: 0, width: 160, height: 20 }]);
  });
});
