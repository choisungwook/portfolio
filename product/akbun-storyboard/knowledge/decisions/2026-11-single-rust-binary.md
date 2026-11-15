---
type: Decision
title: One Rust binary serves the web UI, the CLI and the MCP server
description: The product is a local server opened in a browser, not a Tauri or Electron desktop app.
tags: [architecture, rust, mcp]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-15T00:00:00Z }
---

## 결정

`akbun-storyboard` is a single Rust binary with three entry points (`serve`, `mcp`, `<operation>`) over one SQLite file. The UI is plain HTML and JS compiled into the binary and opened in a browser. There is no desktop shell and no self update; releases are per-platform archives.

## 이유

- Agents are first-class users. MCP clients start a stdio process and shell-based agents run commands; both are simplest when the same binary is the server. A desktop window adds nothing for them.
- A browser page is what an iPad can open over the LAN, which is how hand-drawn sketches and photos get in. A desktop webview cannot be reached from another device.
- The binary is small (`tiny_http`, bundled SQLite, no async runtime) and has no runtime to install, which is what was asked for.
- Without a desktop bundle there is nothing for an updater plugin to replace. If a tray icon or a native window becomes necessary, wrap the same server rather than rewriting it.
