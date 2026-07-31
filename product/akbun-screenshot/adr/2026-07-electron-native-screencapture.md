# Electron with native screencapture

## Decision

Build the app with Electron and plain JavaScript, and delegate the actual capture to the macOS screencapture binary instead of drawing a selection overlay ourselves.

## Reason

- Performance was the concern behind considering Rust, but the performance-critical part is the capture itself, and screencapture is the same native code path the system screenshot uses. The Electron side only shows a tray menu, a settings window, and small preview windows, where the runtime makes no visible difference.
- The repository already has working Electron products and a proven unsigned-dmg release pipeline, so Electron reuses all of it. A Rust app (for example Tauri) would need a new build and release setup for one app.
- Delegating to screencapture removes the hardest UI in the product: the multi-display drag selection overlay, pixel-accurate cropping, and Retina scaling all come for free and behave exactly like the system screenshot.
- Plain JavaScript with no build step keeps the workspace at its minimum: `npm start` runs the sources directly, and tests import pure helpers with plain node.
