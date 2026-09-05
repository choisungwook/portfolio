import { describe, expect, it } from "vitest";
import { sharedAssetDirectory } from "../ui/src/pdf-engine";

describe("PDF.js runtime assets", () => {
  it("uses the common directory for decoder assets", () => {
    expect(sharedAssetDirectory(
      ["/assets/jbig2.wasm", "/assets/jbig2_nowasm_fallback.js"],
      "asset://localhost/index.html",
    )).toBe("asset://localhost/assets/");
  });

  it("rejects assets emitted into different directories", () => {
    expect(() => sharedAssetDirectory(
      ["/assets/jbig2.wasm", "/fallback/jbig2_nowasm_fallback.js"],
      "http://127.0.0.1:1420/",
    )).toThrow("PDF.js 런타임 자산 경로가 일치하지 않습니다.");
  });
});
