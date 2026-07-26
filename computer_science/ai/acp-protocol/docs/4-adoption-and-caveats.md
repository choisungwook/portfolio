# Where it is used, and what to watch for

## What problem it solves

Before ACP, wiring an editor to a coding agent meant a bespoke integration per pair. Ten editors and ten agents is a hundred integrations. ACP borrows the LSP move: define the protocol once and the same problem costs twenty.

The second effect matters more to users than to implementers. Because the protocol standardizes plans, diffs, permission prompts, and terminals rather than just text, an editor can render an agent it has never heard of with its own native UI. The agent is not restricted to a chat box.

## Who uses it

ACP came out of Zed and is now governed jointly by Zed and JetBrains, in a neutral GitHub organization under Apache 2.0, with a stated intent to move to an independent foundation.

On the editor side: Zed, JetBrains IDEs, Emacs, several Neovim plugins, community VS Code extensions, and a long tail of terminal, mobile, and messaging-bridge clients.

On the agent side: Gemini CLI speaks it natively, Claude Code and Codex CLI through adapters, and GitHub Copilot, Cursor, Cline, Goose, OpenCode, and JetBrains Junie among others. Framework support exists for LangGraph, LlamaIndex, Mastra, and Pydantic AI.

Official SDKs cover TypeScript, Rust, Python, Java, and Kotlin. Note that SDK version numbers have nothing to do with the protocol version: the Rust crate is past 2.0 while the Python package is still below 1.0, and both implement protocol version 1.

## What to watch for

**Do not treat the permission prompt as a security boundary.** Nothing in ACP forces an agent to call `session/request_permission`. A buggy or hostile agent can simply not ask. The prompt is a UX contract, not enforcement.

**The client is the only enforcement point, and it must actually enforce.** The spec is explicit that a directory list is not a sandbox, that clients should add operating-system sandboxing, and that path checks must handle symlinks and resolve ambiguous cases as failures. `_resolve()` in `src/client.py` is a one-function sketch of this, not a finished implementation.

**Adding `fs/*` to a client does not remove the agent's own access.** The agent is a subprocess with the permissions of whoever launched it. Routing file access through the client helps only when the agent cooperates.

**stdout belongs to the protocol.** Any library that prints a banner, a warning, or a progress bar to stdout inside your agent process will corrupt the stream. Redirect early.

**stdio is the only stable transport.** HTTP is a draft and remote agents are explicitly a work in progress. Anything that needs an agent on another machine is off the paved path today.

**There is no channel-level authentication.** The `authenticate` method delegates entirely to agent-specific method ids, and ACP defines no credential transport. Related: agents must not use form-mode elicitation to collect passwords, API keys, or payment credentials, and must fail rather than fall back when the client cannot open a URL.

**Cancellation has rules that are easy to get wrong.** After `session/cancel` the agent may still send updates, but must flush them before responding, and must respond with `stopReason: cancelled` rather than an error. The client must answer any pending permission request with a cancelled outcome instead of leaving it hanging.

**Terminals leak unless released.** An agent that calls `terminal/create` must call `terminal/release`. There is no built-in timeout; you compose one from create, timer, kill, output, and release.

**Session loading is expensive when it exists at all.** Persistence is optional and agent-defined. `session/load` replays the entire history as `session/update` notifications before it returns, which is costly on a long session.

**The specification is moving.** Version 1 is stable, but a version 2 draft is published and the maintainers say it will change. The TypeScript package was also renamed from `@zed-industries/agent-client-protocol` to `@agentclientprotocol/sdk`. Pin versions and re-read the spec before shipping.
