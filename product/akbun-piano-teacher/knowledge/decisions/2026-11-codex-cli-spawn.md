---
type: Decision
title: Codex vision call spawns the Codex CLI directly
description: One OMR call on the ChatGPT plan is one `codex exec --experimental-json` run in a read-only sandbox in an empty folder.
tags: [llm, codex, omr]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
sources:
  - id: taskq
    resource: ../../../akbun-taskq/workspace/src/agents/openai/codex.ts
    title: akbun-taskq Codex turn runner
---

## 결정

`src/main/vision/codex.ts` spawns the user's installed `codex` binary with the arguments @openai/codex-sdk would pass (`exec --experimental-json`, `--image`, `--sandbox read-only`, `--cd <empty temp dir>`, `developer_instructions` for the system prompt) and reads the JSONL events: the last `agent_message` is the answer, `turn.completed` has the tokens. Both providers return plain text that `core/omr.ts` parses as JSON; no output schema is sent.

## 이유

- akbun-taskq runs Codex this way[^taskq]: the SDK package pulls a Codex binary of several hundred MB, while the user already has the CLI signed in with "Sign in with ChatGPT". The app only needs the path.
- Codex is a coding agent, so the call is isolated: read-only sandbox, a fresh empty working folder that is removed afterwards, approvals never asked.
- The notation JSON has free voice keys, which strict JSON schemas handle badly. The parser checks every answer anyway, and a malformed answer is retried like any failed check, so one text path serves both providers.
- Codex is free to use only as a non-paid feature under the ChatGPT sign-in terms. If the app is ever sold, replace this adapter with an OpenAI API key adapter behind the same VisionLlm port.

[^taskq]: See `codexArgs` and `runCodexTurn` in the taskq source.
