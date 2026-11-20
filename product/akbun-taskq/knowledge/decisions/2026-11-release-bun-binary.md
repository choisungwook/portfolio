---
type: Decision
title: Release a bun-compiled binary that embeds Claude Code
description: One executable per platform built by bun; Node SEA and requiring an installed claude were rejected.
tags: [release, build, bun]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-20T00:00:00Z }
---

## 결정

`release-akbun-taskq.yml` builds `taskq` with `bun build --compile` on macos-latest (darwin-arm64) and releases it as `akbun-taskq-v<version>`. Linux (linux-x64) was released until 0.22.1 and dropped in 0.22.2 because nobody runs taskq on Linux or Windows; the build cost a runner on every PR and release for no user. The executable embeds `ui/`, `src/db/schema/` and the Claude Code binary of the locked SDK. A checkout still runs the TypeScript sources with Node, so the [no-build decision](2026-11-no-build-typescript-static-ui.md) holds for development.

## 이유

- The Agent SDK documents `bun build --compile` with `extractFromBunfs` for the Claude Code binary, and bun supports `node:sqlite`, so the code runs unchanged apart from `src/resources.ts`.
- Node SEA was rejected: it needs a bundler, an asset API of its own and postject, and the SDK documents no path for it.
- Using the `claude` on PATH was rejected: an auto-updated Claude Code can drift from the SDK's protocol version. Embedding keeps them matched.
- Cost: each binary is about 470 MB because Claude Code alone is about 365 MB, and Claude Code is copied to the temp directory on the first session. Builds run per OS because npm installs only the host's Claude Code package.
