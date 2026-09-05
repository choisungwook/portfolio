import { describe, expect, it } from "vitest";
import {
  applyPageSelection,
  formatPageSelection,
  parsePageRange,
} from "../ui/src/ai-selection";

describe("AI page selection", () => {
  it("parses direct pages and inclusive ranges", () => {
    expect(parsePageRange("2, 4-6, 5", 8)).toEqual([2, 4, 5, 6]);
    expect(parsePageRange("0, 2", 8)).toBeNull();
    expect(parsePageRange("6-4", 8)).toBeNull();
    expect(parsePageRange("2, 9", 8)).toBeNull();
  });

  it("selects a continuous range with Shift", () => {
    const result = applyPageSelection(new Set([2]), 6, 2, 10, {
      shiftKey: true,
      toggleKey: false,
      selectionMode: false,
    });
    expect([...result.pages]).toEqual([2, 3, 4, 5, 6]);
  });

  it("toggles individual pages with Ctrl, Command, or selection mode", () => {
    const result = applyPageSelection(new Set([2, 4]), 3, 4, 10, {
      shiftKey: false,
      toggleKey: true,
      selectionMode: false,
    });
    expect([...result.pages]).toEqual([2, 4, 3]);

    const removed = applyPageSelection(result.pages, 4, result.anchor, 10, {
      shiftKey: false,
      toggleKey: false,
      selectionMode: true,
    });
    expect([...removed.pages]).toEqual([2, 3]);
  });

  it("formats compact page ranges", () => {
    expect(formatPageSelection([1, 2, 3, 5, 8, 9])).toBe("1-3, 5, 8-9페이지");
  });
});
