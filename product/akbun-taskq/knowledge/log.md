# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-18

* **Creation**: [Resident role agents are resumed sessions with a mailbox, and work still runs as tasks](decisions/2026-11-resident-agent-team.md) 결정 기록. 상주 프로세스 대신 resume, 동기 호출 대신 mailbox, agent는 읽기만 하고 일은 큐 작업으로.

## 2026-11-16

* **Creation**: [The runner waits on an in-process wake signal with a 60 second fallback](decisions/2026-11-wake-instead-of-poll.md) 결정 기록. 폴링 2초를 60초로 바꾸고 같은 프로세스 변경은 신호로 깨움.
* **Update**: [Approval waits on a database row, woken by events](decisions/2026-11-db-driven-approval.md) 결정 기록. 1초 폴링에서 이벤트 신호와 60초 fallback으로 바뀜.
* **Creation**: [The taskq UI follows IBM Carbon through a token interface](decisions/2026-11-carbon-design-system.md) 결정 기록. Carbon 선택 이유와 USWDS, GOV.UK를 고르지 않은 이유.
* **Creation**: [Carbon Design System principles and patterns used by the taskq UI](references/carbon-design-system.md) 참고 자료 사본. 원칙, 상태 표시 규칙, 알림 규칙.
* **Creation**: [New features start from an interface](decisions/2026-11-interface-first.md) 결정 기록. The interface comes first and callers import only it; the first implementation is wired in one place.
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
