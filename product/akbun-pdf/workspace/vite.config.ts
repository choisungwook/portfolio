import { defineConfig } from "vite";

const pdfJsRuntimeAssets = new Set([
  "jbig2.wasm",
  "jbig2_nowasm_fallback.js",
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "qcms_bg.wasm",
  "quickjs-eval.js",
  "quickjs-eval.wasm",
]);

export default defineConfig({
  root: "ui",
  publicDir: false,

  clearScreen: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (asset) => {
          const name = asset.names.at(0)?.split("/").at(-1) ?? "";
          return pdfJsRuntimeAssets.has(name)
            ? "assets/[name][extname]"
            : "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
