# Abstract at the agent-runner level, not the model-API level

## Decision

Providers implement one interface: `run(prompt, workdir, system_prompt,
readable_dirs, resume_id) -> AgentRun`. The Claude provider is the Claude
Agent SDK; the OpenAI provider is a `codex exec` subprocess. No LangGraph,
LiteLLM, or hand-rolled tool-use loop.

## Reason

Model portability was a requirement ("swap models like LangGraph"), but those
frameworks abstract raw model APIs, which forces API-key billing on every
provider and would make us reimplement the agentic loop (file reading, search,
tool orchestration) that Claude Agent SDK and codex already ship hardened.
Abstracting one level higher keeps each vendor's own auth (API key for the
Agent SDK — Anthropic does not allow claude.ai subscription login for SDK
apps; OAuth login for codex) and each vendor's own loop, while `--provider`
still swaps them per run. A third agent CLI (e.g. Gemini) becomes one new
adapter file. The cost accepted: no token-level control over the loop, and
codex chat continuity is transcript replay because `codex exec` exposes no
reliable session id to target.
