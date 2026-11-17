# akbun-keychain

A local secret store for AI agents on macOS, Linux and Windows. Secrets are encrypted in one JSON file under a root password. An agent uses a secret by name, without the value entering its context, and nothing leaves the machine.

**Status: in development.** Phases 0 and 1 of the [plan](./wiki/plan.md) are done: `workspace/` has the scaffold, the `version` command and the core library (encryption, vault file, lock file, audit log). There is no usable CLI yet.

## What it will do

- Register, edit, list, delete and use secrets from one executable, `akbun-keychain`.
- Keep values encrypted at rest. Reading `vault.json` shows names and descriptions, never values.
- Let an agent run a command with secrets injected as environment variables, with the values masked in the output it gets back.
- Require the root password for anything that reveals a protected value or changes an existing entry, so an agent that can run commands still cannot change the rules.
- Serve a local page on demand (`akbun-keychain gui`) that opens after the root password is entered.
- Expose the same operations to agents as an MCP server (`akbun-keychain mcp`).

## Directory

| Path | Content |
|---|---|
| [wiki/](./wiki/index.md) | Design: architecture, security model, file format, interfaces, and the implementation plan |
| [knowledge/](./knowledge/index.md) | Decision records |
| `workspace/` | Source and tests |

## Where to start

- To implement: read [wiki/index.md](./wiki/index.md), then follow [wiki/plan.md](./wiki/plan.md) phase by phase.
- To understand a choice: [knowledge/decisions/](./knowledge/decisions/index.md).

## What to know before relying on it

- It protects the file at rest and keeps values out of agent transcripts. It does not stop a process running as the same OS user while the vault is unlocked. The limits are listed in [wiki/security.md](./wiki/security.md).
- A forgotten root password cannot be recovered.
