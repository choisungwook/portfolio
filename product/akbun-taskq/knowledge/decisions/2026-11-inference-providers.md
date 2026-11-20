---
type: Decision
title: Three inference providers selected by config
description: bedrock, api_key and subscription differ only in the child environment taskq builds.
tags: [auth, bedrock, agent-sdk]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-20T00:00:00Z }
---

## 결정

`provider` is `bedrock`, `api_key` or `subscription`. taskq only sets or removes environment variables for the worker and runs a preflight check. The one credential taskq stores is the Anthropic API key entered in Settings > Connections: plain text in `data/anthropic-api-key` with mode 0600, outside the database, preferred over `ANTHROPIC_API_KEY`. The API never returns it.

## 이유

- Claude Code picks credentials in a fixed order: cloud provider variables, then `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, and last the login from `/login`. Selecting a provider therefore means removing the variables that would outrank it, not adding a flag.
- A subscription login does work for SDK and non-interactive runs: the stored `/login` credential or a one-year token from `claude setup-token` in `CLAUDE_CODE_OAUTH_TOKEN`.
- The Agent SDK documentation says third-party developers may not offer claude.ai login or its rate limits in their products without approval. taskq is a personal tool, so it performs no login itself and only lets the user's existing Claude Code login apply. Anyone redistributing it as a product should use `api_key` or `bedrock`.
- The saved API key is not encrypted. Bots run unattended, so whatever decrypts it must be readable by taskq without the user, which means a key file on the same disk or a fixed key in the binary. Either way anyone who can read `data/` can decrypt, so encryption would only look safer. A passphrase entered at start would be real protection but stops unattended restarts. File mode 0600 is the same protection `~/.aws/credentials` and `~/.codex/auth.json` rely on. The macOS Keychain is the upgrade path if the key must not sit in a file.
- Bedrock has no WebSearch tool, so research tasks on that provider rely on WebFetch.
