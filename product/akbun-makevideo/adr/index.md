# Decision records

| Record | Decision |
|---|---|
| [2026-08-tauri-macos-first.md](./2026-08-tauri-macos-first.md) | Tauri with a plain page, macOS build first |
| [2026-08-ffmpeg-as-the-render-engine.md](./2026-08-ffmpeg-as-the-render-engine.md) | Render by shelling out to an installed ffmpeg |
| [2026-08-preview-in-the-webview.md](./2026-08-preview-in-the-webview.md) | Preview by stacking media elements, not by decoding in Rust |
| [2026-08-timeline-model-in-the-page.md](./2026-08-timeline-model-in-the-page.md) | The editing model lives in JavaScript, Rust reads the same shape (replaced) |
| [2026-08-edit-model-in-rust.md](./2026-08-edit-model-in-rust.md) | The editing model lives in Rust, and every edit is a command |
| [2026-08-clips-do-not-overlap.md](./2026-08-clips-do-not-overlap.md) | A track holds one clip at a time; a drop pushes right |
| [2026-08-rational-time.md](./2026-08-rational-time.md) | Time is a frame count on a rate of two integers, so 29.97 is exact |
| [2026-08-projects-reference-media.md](./2026-08-projects-reference-media.md) | A project is a folder that references media, never a copy of it |
| [2026-08-render-preset-is-the-long-edge.md](./2026-08-render-preset-is-the-long-edge.md) | FHD and 4K set the long edge and keep the project aspect |
| [2026-08-gpu-means-hardware-encode.md](./2026-08-gpu-means-hardware-encode.md) | GPU rendering means hardware encode, detected by trying it |
| [2026-08-one-compositor-for-preview-and-render.md](./2026-08-one-compositor-for-preview-and-render.md) | One compositor for the preview and the render |
| [2026-08-in-page-menu-bar.md](./2026-08-in-page-menu-bar.md) | The menu bar is HTML, not a native menu |
| [2026-08-updater-fixed-tag-endpoint.md](./2026-08-updater-fixed-tag-endpoint.md) | The updater polls a fixed per-product tag, not releases/latest |
| [2026-08-playback-quality-harness.md](./2026-08-playback-quality-harness.md) | Playback engines pass one numeric quality harness |
| [2026-08-prefetch-frame-source.md](./2026-08-prefetch-frame-source.md) | Frames come from a per-clip prefetch buffer, not from a synchronous read |
| [2026-08-audio-is-the-master-clock.md](./2026-08-audio-is-the-master-clock.md) | The audio output is the master clock and the picture follows it |
| [2026-08-native-viewport-and-skip-late-frames.md](./2026-08-native-viewport-and-skip-late-frames.md) | The monitor draws on a native surface, and a late frame is skipped |
| [2026-08-playback-proxies.md](./2026-08-playback-proxies.md) | 4K playback uses validated 1280px proxies while export keeps originals |
| [2026-08-asset-waveform-cache.md](./2026-08-asset-waveform-cache.md) | Audio waveforms are cached per asset and clips draw only their source interval |
| [2026-08-native-project-trash.md](./2026-08-native-project-trash.md) | Windows and macOS move validated project targets with native trash APIs |
| [2026-08-common-visual-item-model.md](./2026-08-common-visual-item-model.md) | Text, shape, image and video overlays share one timed transform model |
| [2026-08-program-monitor-transform.md](./2026-08-program-monitor-transform.md) | Transform Visual Items in project space through an editor-only monitor pass |
| [2026-08-edit-point-navigation.md](./2026-08-edit-point-navigation.md) | Visible clip boundaries drive previous and next edit navigation |
| [2026-08-persistent-playback-pipeline.md](./2026-08-persistent-playback-pipeline.md) | Play and pause keep one decoder and audio pipeline alive |
| [2026-08-live-playback-reconfiguration.md](./2026-08-live-playback-reconfiguration.md) | Playback settings switch after the replacement picture is ready |
| [2026-08-reusable-seek-decoder.md](./2026-08-reusable-seek-decoder.md) | Short forward seeks reuse a decoder and may show two earlier frames |
| [2026-09-playback-speed-and-audio-curves.md](./2026-09-playback-speed-and-audio-curves.md) | Clip duration is derived from speed; pitch preservation defaults on and fades stay separate from keyframes |
| [2026-09-pip-video-overlay.md](./2026-09-pip-video-overlay.md) | PIP uses the common visual-item model and warns beyond four simultaneous video sources |
| [2026-09-dissolve-boundary-object.md](./2026-09-dissolve-boundary-object.md) | Dissolve is a separate adjacent-clip boundary object with interval-only dual decode |
| [2026-09-codex-app-server-ai.md](./2026-09-codex-app-server-ai.md) | AI uses the user's Codex App Server and app-owned bounded sessions |
