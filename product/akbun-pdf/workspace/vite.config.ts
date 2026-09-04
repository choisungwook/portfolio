import { defineConfig } from "vite";

export default defineConfig({
  root: "ui",
  publicDir: false,

  clearScreen: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true,
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
