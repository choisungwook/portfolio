---
type: Decision
title: Write everything in TypeScript on Node and release a bun-compiled binary
description: One language for the CLI, agent, MCP server and page; Go and Rust were rejected.
tags: [typescript, bun, release]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

The CLI, the agent, the MCP server and the GUI server are TypeScript that Node 24 runs by type stripping. The page is plain JavaScript ES modules checked by the same `tsc`. Releases are one `bun build --compile` executable per platform for macOS, Linux and Windows. The only runtime dependency is `@modelcontextprotocol/sdk`; HTTP and crypto come from the Node standard library.

## 이유

- The requirement was one language for the backend and the page. TypeScript is the only candidate where that is literally true.
- [akbun-taskq](../../../akbun-taskq/knowledge/decisions/2026-11-release-bun-binary.md) already ships this shape from this repository: no build step in a checkout, a bun binary for release, the UI embedded. Its scripts and workflow are reused instead of invented.
- The MCP TypeScript SDK is the reference implementation, so the MCP surface needs no third-party port.
- Go was rejected: it cross-compiles more simply and gives a smaller binary, but the page would be a second language and the repository has no Go product to share patterns with.
- Rust was rejected: it can wipe keys from memory and lock pages, which JavaScript cannot. That gap is real and is listed in the security page as a limit. It was not worth a second language for the page plus a per-platform build with three sets of IPC code, for a tool whose stated threat is the file at rest and the transcript, not a memory-reading attacker.
- Tauri and Electron were rejected: the page is opened on demand from the CLI and needs no window, tray or installer. A browser tab against 127.0.0.1 is enough.
- Cost: the binary carries the bun runtime, and secrets held as JavaScript strings cannot be zeroed.
