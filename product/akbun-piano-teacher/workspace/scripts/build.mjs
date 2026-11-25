// Bundles main, preload and renderer with esbuild and copies the static renderer files into dist/.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'

const common = { bundle: true, sourcemap: false, logLevel: 'warning', target: 'es2023' }

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.cjs', platform: 'node', format: 'cjs', external: ['electron', 'electron-updater'] }),
  build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/preload.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', platform: 'browser', format: 'iife' }),
])

mkdirSync('dist/renderer', { recursive: true })
for (const file of ['index.html', 'style.css']) copyFileSync(`src/renderer/${file}`, `dist/renderer/${file}`)
