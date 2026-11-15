---
type: Decision
title: Run TypeScript by type stripping and ship the UI as static modules
description: No bundler and no UI framework; the first idea was React with Vite and a calendar library.
tags: [typescript, ui, build]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-15T00:00:00Z }
---

## 결정

The server and CLI are TypeScript that Node 24 runs directly. `tsc --noEmit` checks types and nothing is emitted. The UI is plain ES modules served as files, and the calendar is hand written.

## 이유

- The tool runs on one machine from a checkout. A build step would only add a way for the running code to differ from the source.
- The calendar needs three views of one small data set. Laying out overlapping blocks is about a hundred lines, less than adapting a calendar library's event model to runs with waiting segments.
- Fewer dependencies means less to audit in a tool that can approve changes to live accounts.
- Cost: type stripping forbids `enum` and parameter properties, and imports need the `.ts` extension. `erasableSyntaxOnly` makes the compiler enforce it.
