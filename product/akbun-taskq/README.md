# akbun-taskq

A personal agent task queue. You add tasks, several Claude sessions work through them in parallel, and one local page shows what ran when and what needs your attention.

- One process holds the runner, the HTTP API and the UI. It binds to 127.0.0.1 only.
- State lives in one SQLite file. Nothing leaves the machine except the model calls the sessions make.
- A task that changes a live account stops and waits until you approve the exact command.
- Optional resident bots on the Claude Agent SDK or the OpenAI Agents SDK: the orchestrator taskq plus bots you create (planner, coder, reviewer, doc-reviewer presets) split a request, take tasks, share a wiki and a folder, and read like chats in the left menu. Off by default.
- Workflows: draw steps as a graph, assign one to a task and a bot, and follow each run with the bot that ran it and whether it really succeeded.
- Everything the UI does is also a CLI command (`taskq api`, `taskq workflows`) and an MCP tool (`taskq mcp`).

## Directory

| Path | Content |
|---|---|
| [workspace/](./workspace/) | Source, tests, the static UI and the [manual](./workspace/manual.md) |
| [CHANGELOG.md](./CHANGELOG.md) | Versioned changes and the source of GitHub release notes |
| [wiki/](./wiki/index.md) | Architecture, development notes, feature map |
| [knowledge/](./knowledge/index.md) | Decision records |

## Use it

The manual has the whole path from install to daily use: [workspace/manual.md](./workspace/manual.md).

To look at every screen first, with invented data and no agent session, run these in `workspace/`.

```bash
npm ci
```

```bash
npm run demo
```

## What to know before relying on it

- A task that changes a live account stops before each change and shows the exact command for approval.
- The page and API need the token in the URL that `taskq run` prints; it changes on every start.
- A real model session, the sandbox and provider authentication errors were not exercised by the tests. The manual lists what to check once on your own machine.
