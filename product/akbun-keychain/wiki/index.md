# akbun-keychain wiki

Read this before writing or changing the product. All phases of [plan.md](./plan.md) are implemented. These pages describe what the code does and why; keep them in step with it.

- [architecture.md](./architecture.md): the four process roles, who holds the key, key flows, source layout
- [security.md](./security.md): threat model, key hierarchy, the access rule, known limits
- [vault-format.md](./vault-format.md): `vault.json` schema, authenticated data, file lock, audit log
- [interfaces.md](./interfaces.md): CLI commands, agent protocol, MCP tools, GUI HTTP API
- [features.md](./features.md): GUI areas and their `data-area` names
- [development.md](./development.md): stack, design system, run, test, release workflow, what was verified and what was not
- [plan.md](./plan.md): implementation phases with completion checks

Decisions and their reasons are in [../knowledge/decisions/](../knowledge/decisions/index.md).

The one-paragraph version: one TypeScript executable with four roles. The CLI and the MCP server are thin clients. A background agent, started by `unlock` after the root password is typed, holds the data key in memory until it times out, and is the only process that hands secrets to child processes. `gui` starts a short-lived HTTP server on 127.0.0.1 for the page. All state is `~/.akbun-keychain/vault.json`, written under a lock file with an atomic rename.

When a page here and the code disagree after implementation starts, fix the page in the same commit.
