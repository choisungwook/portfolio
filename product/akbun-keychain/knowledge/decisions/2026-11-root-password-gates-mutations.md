---
type: Decision
title: The root password, not caller detection, decides what an operation may do
description: A session may use and create; revealing protected values and changing anything existing need the password.
tags: [security, policy, access]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

An unlocked session may list, run commands with `inject` and `reveal` keys, read `reveal` values, and create keys under new names as `inject`. Reading an `inject` or `deny` value, using a `deny` key, and overwriting, editing, renaming or deleting any entry require the root password for that operation. Each key carries one level in `ai_access`: `inject` (default), `reveal`, `deny`. The MCP server has no tool for password-gated operations.

## 이유

- The agent and the human run as the same OS user and can both run the CLI. Telling them apart by checking for a terminal fails in both directions: an agent can allocate a pseudo terminal, and a human pipes output. What an agent does not have is the root password, so that is what the rule tests.
- `inject` as the default keeps values out of model context and logs, which is where accidental leaks happen. `reveal` exists because some tools need the text, and the owner decides which keys those are.
- Creation is allowed in a session because an agent that just generated a token should be able to store it, and a new entry harms nothing. Overwriting is not, because it would let an agent replace a credential the human relies on.
- A design with only two levels (usable, not usable) was rejected: without `reveal` people would work around the store for values that are harmless as text.
- Known limit: an agent can make a child print a transformed `inject` value. Masking is accident prevention. Keys that must be out of reach are `deny`. A per-key program allowlist is left for later.
