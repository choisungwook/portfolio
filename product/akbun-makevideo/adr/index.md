# Decision records

| Record | Decision |
|---|---|
| [2026-08-tauri-macos-first.md](./2026-08-tauri-macos-first.md) | Tauri with a plain page, macOS build first |
| [2026-08-ffmpeg-as-the-render-engine.md](./2026-08-ffmpeg-as-the-render-engine.md) | Render by shelling out to an installed ffmpeg |
| [2026-08-preview-in-the-webview.md](./2026-08-preview-in-the-webview.md) | Preview by stacking media elements, not by decoding in Rust |
| [2026-08-timeline-model-in-the-page.md](./2026-08-timeline-model-in-the-page.md) | The editing model lives in JavaScript, Rust reads the same shape |
| [2026-08-clips-do-not-overlap.md](./2026-08-clips-do-not-overlap.md) | A track holds one clip at a time; a drop pushes right |
| [2026-08-projects-reference-media.md](./2026-08-projects-reference-media.md) | A project is a folder that references media, never a copy of it |
| [2026-08-render-preset-is-the-long-edge.md](./2026-08-render-preset-is-the-long-edge.md) | FHD and 4K set the long edge and keep the project aspect |
| [2026-08-gpu-means-hardware-encode.md](./2026-08-gpu-means-hardware-encode.md) | GPU rendering means hardware encode, detected by trying it |
| [2026-08-one-compositor-for-preview-and-render.md](./2026-08-one-compositor-for-preview-and-render.md) | One compositor for the preview and the render |
| [2026-08-in-page-menu-bar.md](./2026-08-in-page-menu-bar.md) | The menu bar is HTML, not a native menu |
| [2026-08-updater-fixed-tag-endpoint.md](./2026-08-updater-fixed-tag-endpoint.md) | The updater polls a fixed per-product tag, not releases/latest |
