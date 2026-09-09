# Tauri with Svelte and TypeScript

## Decision

Tauri 2 with a Rust backend. The page is Svelte 5 and TypeScript, built by Vite, with Chart.js as the one chart library. This departs from the plain-JavaScript-no-build-step default for Tauri products.

## Reason

Tauri is the default for a desktop app here, and everything the app does that is not painting the window, which is OAuth, HTTP, SQLite and the cache rule, is Rust anyway. Electron would add a bundled browser for no gain.

The page was asked for as Svelte or React with TypeScript. The screen is four cards, a chart and two tables driven by one typed row shape, so typing the command results and rendering tables from derived state is where the framework pays. A build step is the price, and it is one `vite build` that the Tauri config runs before a bundle, so `npm start` and `npm run dist` behave the same as the no-build products.

Chart.js is registered with only the bar controller and the two scales so the bundle stays around 200 KB before gzip.
