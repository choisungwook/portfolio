# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-16

* **Creation**: [Agent SDKs plug in behind one AgentBackend interface](decisions/2026-11-agent-backend-interface.md) 결정 기록. createWorker, preflight and ask; the gate policy stays shared and each backend maps its own hook to it.
* **Creation**: [A call that reaches taskq itself stops the run for review](decisions/2026-11-tamper-stops-run.md) 결정 기록. Sandbox-off, data directory, taskq config and ~/.claude writes end the session; the PreToolUse hook is fail-closed.
* **Creation**: [Release a bun-compiled binary that embeds Claude Code](decisions/2026-11-release-bun-binary.md) 결정 기록. One executable per platform built by bun; Node SEA and requiring an installed claude were rejected.
* **Update**: [Run TypeScript by type stripping and ship the UI as static modules](decisions/2026-11-no-build-typescript-static-ui.md) 결정 기록. The no-build reason now covers development only; the released binary is packaging.

## 2026-11-15

* **Update**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. Reads are confined by path, and project settings load only for trusted repositories.
* **Update**: [Approval waits by polling the events table](decisions/2026-11-db-driven-approval.md) 결정 기록. The wait now polls the `approvals` row, which binds the decision to one request id.
* **Creation**: [Approval shows and stores the exact input, bound to a request id](decisions/2026-11-approval-shows-exact-input.md) 결정 기록. The unmasked input lives in its own table until decided; decisions name a request id and the API needs a per-start token.
* **Update**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. Added the reason that gating moved into PreToolUse hooks; the 'ask' behavior is not yet exercised with a real session.
* **Creation**: [Store tasks in SQLite, not in markdown, JSON or YAML files](decisions/2026-11-storage-sqlite.md) 결정 기록. One SQLite file in WAL mode holds every table; plain files were rejected because of locking.
* **Creation**: [Run TypeScript by type stripping and ship the UI as static modules](decisions/2026-11-no-build-typescript-static-ui.md) 결정 기록. No bundler and no UI framework; the first idea was React with Vite and a calendar library.
* **Creation**: [Three inference providers selected by config](decisions/2026-11-inference-providers.md) 결정 기록. bedrock, api_key and subscription differ only in the child environment taskq builds.
* **Creation**: [Approval waits by polling the events table](decisions/2026-11-db-driven-approval.md) 결정 기록. A pending approval is a database row, not an in-memory promise.
* **Creation**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. What the SDK documentation changed in the original permission plan.
