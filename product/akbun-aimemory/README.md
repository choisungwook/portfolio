# akbun-aimemory

Local long-term memory for AI coding agents. Hooks from Claude Code, Codex, Kiro and Antigravity send each prompt, tool call and reply to the `aimem` CLI, which stores them in one SQLite file. The next session starts with the relevant memories in its context, and a web UI lists, searches and deletes them.

- Hybrid search: BM25 keyword index plus hashed term vectors, fused with reciprocal rank fusion and a recency decay.
- No AI model is needed for search. The builtin tokenizer handles Korean, English, Japanese and Chinese; any open-source tokenizer can replace it through a command adapter.
- A hook never breaks the agent: if the database is unavailable the event is spooled and replayed later.

## Directory

| Path | Content |
|---|---|
| [workspace/](./workspace/) | CLI, web UI, agent skill and tests |
| [wiki/](./wiki/index.md) | Architecture, development notes, feature map |
| [knowledge/](./knowledge/index.md) | Decision records |

## Quick start

Run these in `workspace/` with Node 24 or later.

```bash
npm ci
```

```bash
npm link && aimem --help
```

Add the hook to Claude Code (`~/.claude/settings.json`); the other agents take the same command with their own `--agent` value.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "aimem hook --agent claude" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "aimem hook --agent claude" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "aimem hook --agent claude" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "aimem hook --agent claude" }] }]
  }
}
```

Open the web UI with the URL this prints.

```bash
aimem serve
```

## Status

Version 0.1.0 is a skeleton: CLI, storage, search, fallback and web UI work. The desktop app, MCP server, LLM indexer, TLS settings and binary release are open GitHub issues labelled `akbun-aimemory`.
