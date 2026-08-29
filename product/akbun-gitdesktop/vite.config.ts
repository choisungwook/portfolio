import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true
  }
})
