---
type: Decision
title: Write the MCP server on the SDK's low-level Server with JSON Schema tool inputs
description: McpServer with zod schemas was rejected to keep @modelcontextprotocol/sdk the only runtime dependency.
tags: [mcp, dependencies]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-17T13:40:00Z }
---

## 결정

`src/mcp/server.ts` uses `Server` from `@modelcontextprotocol/sdk/server/index.js` with handlers for `tools/list` and `tools/call`. Tool inputs are plain JSON Schema objects, and the handler checks the values it reads. The agent validates every parameter again, so the MCP layer stays a thin forwarder.

## 이유

- The high-level `McpServer.registerTool` takes zod shapes. Importing zod directly would add a second runtime dependency, and relying on the SDK's own copy of zod would tie the build to an internal detail of the SDK.
- The stack decision allows one runtime dependency, the SDK. [The stack decision](2026-11-typescript-node-bun-stack.md) has the reasons.
- Five tools are few enough that hand-written JSON Schema stays readable.
