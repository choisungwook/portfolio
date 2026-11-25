---
type: Decision
title: Electron and TypeScript instead of Tauri
description: The app needs Web MIDI and camera capture in one engine on macOS and Windows, and node LLM SDKs in-process.
tags: [electron, stack, midi]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: intent
    resource: /references/piano-coach-intent-architecture-v0.3.md
    title: Piano Coach intent and architecture v0.3
---

## 결정

The desktop app is Electron with TypeScript. The renderer is plain TypeScript bundled by esbuild, without a UI framework.

## 이유

- Tauri renders in WKWebView on macOS, which has no Web MIDI API, and camera permission there has a history of trouble. Reading the digital piano over USB-MIDI is the core of the app[^intent].
- macOS and Windows are both needed now. Electron carries one Chromium, so MIDI, MediaRecorder and audio behave the same on both.
- The vision adapters use node packages (`@anthropic-ai/sdk`, a spawned Codex CLI). Tauri would need a sidecar process for them.
- The screens are few and mostly canvas and SVG (OSMD), so React and Zustand from the intent document were left out; plain DOM code is enough at this size. Add a framework when screens start sharing state that plain modules cannot keep in step.

[^intent]: Section 2 of the intent document lists the same reasons.
