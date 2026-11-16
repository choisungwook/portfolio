# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [Store tasks in SQLite, not in markdown, JSON or YAML files](2026-11-storage-sqlite.md) - One SQLite file in WAL mode holds every table; plain files were rejected because of locking.
* [Run TypeScript by type stripping and ship the UI as static modules](2026-11-no-build-typescript-static-ui.md) - No bundler and no UI framework; the first idea was React with Vite and a calendar library.
* [Three inference providers selected by config](2026-11-inference-providers.md) - bedrock, api_key and subscription differ only in the child environment taskq builds.
* [Approval waits by polling the events table](2026-11-db-driven-approval.md) - A pending approval is a database row, not an in-memory promise.
* [Approval shows and stores the exact input, bound to a request id](2026-11-approval-shows-exact-input.md) - The unmasked input lives in its own table until decided; decisions name a request id and the API needs a per-start token.
* [Permission profiles follow how the SDK evaluates a tool call](2026-11-permission-profiles.md) - What the SDK documentation changed in the original permission plan.
* [The taskq UI follows IBM Carbon through a token interface](2026-11-carbon-design-system.md) - Carbon was chosen for its license, principles and status and notification patterns; the theme is one implementation of a token contract.
* [New features start from an interface](2026-11-interface-first.md) - The interface comes first and callers import only it; the first implementation is wired in one place.
* [Agent SDKs plug in behind one AgentBackend interface](2026-11-agent-backend-interface.md) - createWorker, preflight and ask; the gate policy stays shared and each backend maps its own hook to it.
* [A call that reaches taskq itself stops the run for review](2026-11-tamper-stops-run.md) - Sandbox-off, data directory, taskq config and ~/.claude writes end the session; other denials only refuse the call.
* [Release a bun-compiled binary that embeds Claude Code](2026-11-release-bun-binary.md) - One executable per platform built by bun; Node SEA and requiring an installed claude were rejected.
