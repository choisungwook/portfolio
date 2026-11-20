---
type: Decision
title: Task permission profiles follow how the SDK evaluates a tool call
description: Profiles per task type for runs the queue or the run button starts; bots use their own per-bot permission mode.
tags: [agent-sdk, permissions, sandbox]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

Read-only account tasks use `dontAsk` with `Bash(aws *)` allowed and a `PreToolUse` hook that denies every verb outside describe, list and get. Change tasks use `default` with `canUseTool` and no bare `Bash` allow rule. These profiles apply to runs the queue or the run button starts. A bot's turn does not use them: each bot has its own permission mode, sandbox and blocked commands, see [bots execute tasks](2026-11-bots-execute-tasks.md).

## 이유

- The SDK checks hooks, deny rules, ask rules, the mode, allow rules, and only then `canUseTool`. A bare tool name in `allowedTools` approves every call before the callback runs, so an approval gate must not list `Bash`.
- In `dontAsk` the callback never runs and anything not allowed is denied. Allow rules match command prefixes, which cannot express "any service, read verbs only", so a hook that reads the whole command does it. A hook deny holds in every mode.
- `settingSources` includes `user` to load personal skills, which also loads the user's own allow rules. A broad rule there can approve a change command before `canUseTool`. Keep user allow rules narrow on a machine that runs change tasks.
- Sandboxed commands reach no host outside `sandbox.network.allowedDomains`, and `dontAsk` refuses instead of prompting. Account endpoints must be listed in the config.
- `auto` exists on every provider but only for supported models, and an organization can disable it. `autoMode: false` switches to `acceptEdits` with an allow list.
- `maxBudgetUsd` is a client-side estimate, not a billing limit.
- Gating lives in PreToolUse hooks because user allow rules and skill allowed-tools are evaluated before canUseTool; the 'ask' decision forcing a prompt past an allow rule is taken from the SDK types and docs and has not been exercised with a real session.
- Read tools are confined by path because an allowed Read of a credential file plus any allowed network call is an exfiltration path. Sessions load only user settings unless the repository is listed as trusted, because a repository's own settings can define hooks that run commands.
