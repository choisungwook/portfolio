---
type: Decision
title: A background agent holds the data key after the human unlocks
description: ssh-agent pattern over a local socket; OS keychains, a password per call and a key file were rejected.
tags: [agent, session, ipc]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

`unlock` asks the human for the root password, derives the data key and hands it to a detached agent process, which keeps it in memory until `lock`, 15 minutes idle or 8 hours. The CLI and the MCP server reach the agent over a Unix domain socket or a Windows named pipe, with a session token on every request. The agent, not the client, spawns child processes that receive secrets.

## 이유

- An AI client cannot type the root password and must not learn it, yet it has to use secrets many times in a session. Something has to remember the key between calls.
- Asking for the password on every call was rejected: only a human can answer, so agents could not use the vault at all.
- Writing the derived key to a file for the session was rejected: it puts the key on disk, which is the thing the product exists to avoid.
- Storing the key in the OS keychain (Keychain, libsecret, Credential Manager) was rejected: three native integrations, and on Linux no guarantee that a secret service is running. It would also make the vault's protection depend on the login session rather than on the root password.
- The agent spawns the child itself because returning the value to the client for it to spawn would make `inject` meaningless: any client could ask for the value and keep it.
- Cost: a long-lived process, a stale `agent.json` to detect, and `run` has no terminal for the child.
