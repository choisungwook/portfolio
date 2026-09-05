import { describe, expect, it } from "vitest";
import { installStreamAsyncIteration, sharedAssetDirectory } from "../ui/src/pdf-engine";

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

describe("WebKit ReadableStream fallback", () => {
  it("iterates a stream that lacks the async iterator", async () => {
    class LegacyStream {
      released = 0;
      private chunks = ["a", "b"];
      getReader() {
        return {
          read: async () => this.chunks.length
            ? { done: false, value: this.chunks.shift() }
            : { done: true, value: undefined },
          cancel: async () => undefined,
          releaseLock: () => {
            this.released += 1;
          },
        };
      }
    }
    installStreamAsyncIteration(LegacyStream.prototype);
    const stream = new LegacyStream();
    const seen: string[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<string>) seen.push(chunk);
    expect(seen).toEqual(["a", "b"]);
    expect(stream.released).toBe(1);
  });
});
