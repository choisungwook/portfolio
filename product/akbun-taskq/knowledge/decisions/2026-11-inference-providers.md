---
type: Decision
title: Three inference providers selected by config
description: bedrock, api_key and subscription differ only in the child environment taskq builds.
tags: [auth, bedrock, agent-sdk]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-15T00:00:00Z }
---

# Three inference providers selected by config

## 결정

`provider` is `bedrock`, `api_key` or `subscription`. taskq never reads or stores a key or token. It only sets or removes environment variables for the worker and runs a preflight check.

## 이유

- Claude Code picks credentials in a fixed order: cloud provider variables, then `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, and last the login from `/login`. Selecting a provider therefore means removing the variables that would outrank it, not adding a flag.
- A subscription login does work for SDK and non-interactive runs: the stored `/login` credential or a one-year token from `claude setup-token` in `CLAUDE_CODE_OAUTH_TOKEN`.
- The Agent SDK documentation says third-party developers may not offer claude.ai login or its rate limits in their products without approval. taskq is a personal tool, so it performs no login itself and only lets the user's existing Claude Code login apply. Anyone redistributing it as a product should use `api_key` or `bedrock`.
- Bedrock has no WebSearch tool, so research tasks on that provider rely on WebFetch.
